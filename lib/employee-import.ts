import "server-only";
import ExcelJS from "exceljs";

import { ALL_EMPLOYEE_FORM_FIELDS } from "@/config/employee-fields";
import { normalizeExcelBuffer } from "@/lib/excel-import";
import { FIELD_MASTER_DATA_SOURCE } from "@/config/field-master-data-map";
import { employeeSchema } from "@/schemas/employee.schema";
import { createEmployee, bulkCreateEmployees } from "@/lib/employee-service";
import { getAllMasterData } from "@/lib/master-data-service";
import type { EmployeeInput } from "@/lib/database/types";

/**
 * Bulk-import employees from an .xls or .xlsx file — used by the Import button on
 * both Active and Inactive Employees pages (a new record's STATUS column
 * decides which list it shows up in afterward). Column headers must match
 * the labels used in `ALL_EMPLOYEE_FORM_FIELDS` (same labels the template
 * download below produces) — matched case-insensitively so a slightly
 * different capitalization still works.
 */

const WRITABLE_FIELDS = ALL_EMPLOYEE_FORM_FIELDS.filter((f) => !f.readOnly);

/**
 * A DATE-column cell whose source .xlsx never had a real date number-format
 * applied (e.g. pasted as plain values) comes back from ExcelJS as a bare
 * number instead of a Date instance — the Excel/Sheets "serial day count"
 * since 1899-12-30. Left unconverted this was silently stored as literal
 * digit strings like "43179" instead of a date.
 */
function excelSerialToISODate(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
}

export async function buildImportTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Employee Management System";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Employees", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = WRITABLE_FIELDS.map((f) => ({ header: f.label, key: f.key, width: Math.max(14, f.label.length + 2) }));
  sheet.getRow(1).font = { bold: true };
  for (const col of sheet.columns) {
    (col as ExcelJS.Column).width = Math.max(14, String(col.header ?? "").length + 2);
  }
  sheet.columns.forEach((_, idx) => {
    sheet.getColumn(idx + 1).numFmt = "@"; // text — protects NIK-like values from losing leading zeros
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ImportRowOutcome {
  row: number; // 1-indexed spreadsheet row, including header
  name: string; // best-effort from the row's NAME column — "(no name)" if it was blank/missing
}

export interface ImportRowError extends ImportRowOutcome {
  message: string;
}

export interface ImportResult {
  created: ImportRowOutcome[];
  errors: ImportRowError[];
}

export class ImportParseError extends Error {}

export interface ImportProgressEvent {
  totalRows: number;
  processedRows: number;
  createdCount: number;
  errorCount: number;
  row: number;
  name: string;
  status: "created" | "error";
  message?: string;
}

/**
 * For every select field backed by Master Data (Department, Position,
 * Level, Marital Status, etc.), builds a case-insensitive lookup to the
 * canonical name currently in Master Data — e.g. an Excel value of
 * "cutting" matches Master Data's "CUTTING" and gets normalized to that
 * exact spelling before saving. A value that doesn't match anything (even
 * ignoring case) is left as-is — still saved, just flagged as unrecognized
 * in the Edit Employee form.
 */
export async function buildMasterDataCasingMap(): Promise<Map<string, Map<string, string>>> {
  const allMasterData = await getAllMasterData();
  const byField = new Map<string, Map<string, string>>();

  for (const [fieldKey, source] of Object.entries(FIELD_MASTER_DATA_SOURCE)) {
    const names =
      source.kind === "sheet" ? allMasterData[source.sheet].map((i) => i.name) : (allMasterData.lookup[source.type] ?? []).map((i) => i.name);
    const casingMap = new Map<string, string>();
    for (const name of names) casingMap.set(name.toLowerCase(), name);
    byField.set(fieldKey, casingMap);
  }

  return byField;
}

export function normalizeToMasterDataCasing(input: EmployeeInput, casingByField: Map<string, Map<string, string>>): void {
  for (const [fieldKey, casingMap] of casingByField) {
    const raw = input[fieldKey];
    if (!raw) continue;
    const canonical = casingMap.get(raw.toLowerCase());
    if (canonical) input[fieldKey] = canonical;
  }
}

/**
 * Reads the uploaded workbook's first sheet, validates each row, and creates
 * one employee per valid row. `onProgress` (optional) fires once per row —
 * used by the import API route to stream live "X of Y done" counts back to
 * the dialog instead of the client waiting on one big response.
 */
export async function importEmployeesFromWorkbook(
  buffer: Buffer,
  onProgress?: (event: ImportProgressEvent) => void,
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // Cast needed for a Node/@types/node Buffer generic mismatch (Buffer<ArrayBufferLike> vs Buffer) — same value at runtime.
    await workbook.xlsx.load(normalizeExcelBuffer(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new ImportParseError("This doesn't look like a valid .xls or .xlsx file.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportParseError("The uploaded file has no sheets.");

  const headerRow = sheet.getRow(1);
  const columnKeyByIndex = new Map<number, string>();
  const dateColumnIndices = new Set<number>();
  headerRow.eachCell((cell, colNumber) => {
    const label = String(cell.value ?? "").trim().toLowerCase();
    const field = WRITABLE_FIELDS.find((f) => f.label.toLowerCase() === label);
    if (field) {
      columnKeyByIndex.set(colNumber, field.key);
      if (field.type === "date") dateColumnIndices.add(colNumber);
    }
  });

  if (columnKeyByIndex.size === 0) {
    throw new ImportParseError(
      "No recognizable column headers found. Download the sample template and use its headers exactly.",
    );
  }

  const casingByField = await buildMasterDataCasingMap();

  // Pass 1: pull out every non-blank data row up front so we know the total
  // row count before starting the (slow, one-API-call-per-row) create loop —
  // that total is what lets the dialog show "X of Y done" progress.
  const dataRows: { rowNumber: number; input: EmployeeInput }[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values == null) continue;

    const input: EmployeeInput = {};
    let hasAnyValue = false;
    columnKeyByIndex.forEach((key, colNumber) => {
      const cell = row.getCell(colNumber);
      let value = cell.value;
      if (value instanceof Date) {
        value = value.toISOString().slice(0, 10);
      } else if (dateColumnIndices.has(colNumber) && typeof value === "number" && Number.isFinite(value)) {
        value = excelSerialToISODate(value);
      } else if (value && typeof value === "object" && "text" in value) {
        value = String((value as { text: unknown }).text);
      }
      const str = value === null || value === undefined ? "" : String(value).trim();
      if (str) hasAnyValue = true;
      input[key] = str;
    });

    if (!hasAnyValue) continue; // skip fully blank rows (trailing empty rows are common in spreadsheets)
    dataRows.push({ rowNumber, input });
  }

  const totalRows = dataRows.length;
  const created: ImportRowOutcome[] = [];
  const errors: ImportRowError[] = [];

  function reportProgress(rowNumber: number, name: string, status: "created" | "error", message?: string) {
    onProgress?.({
      totalRows,
      processedRows: created.length + errors.length,
      createdCount: created.length,
      errorCount: errors.length,
      row: rowNumber,
      name,
      status,
      message,
    });
  }

  // Pass 2: validate every row up front (fast, no database calls) — only
  // rows that pass validation go on to the (much slower, network-bound) save
  // step below.
  const validRows: { rowNumber: number; name: string; data: EmployeeInput }[] = [];
  for (const { rowNumber, input } of dataRows) {
    normalizeToMasterDataCasing(input, casingByField);
    const name = input.name?.trim() || "(no name)";

    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid row.";
      errors.push({ row: rowNumber, name, message });
      reportProgress(rowNumber, name, "error", message);
      continue;
    }
    validRows.push({ rowNumber, name, data: parsed.data });
  }

  // Pass 3: save in chunks — one bulk insert per chunk instead of one
  // request per row. A file with thousands of rows saved row-by-row (each a
  // separate network round trip to Postgres) can't finish inside a
  // serverless function's time limit; chunking is what actually fixes that,
  // not just the progress reporting. On the rare chunk that errors (e.g. a
  // genuinely bad value Postgres itself rejects), fall back to saving that
  // chunk's rows one at a time so the error can still be pinned to the exact
  // row instead of failing the whole chunk.
  const CHUNK_SIZE = 200;
  for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
    const chunk = validRows.slice(i, i + CHUNK_SIZE);
    try {
      await bulkCreateEmployees(chunk.map((r) => r.data));
      for (const r of chunk) created.push({ row: r.rowNumber, name: r.name });
      reportProgress(chunk[chunk.length - 1].rowNumber, chunk[chunk.length - 1].name, "created");
    } catch {
      for (const r of chunk) {
        try {
          await createEmployee(r.data);
          created.push({ row: r.rowNumber, name: r.name });
          reportProgress(r.rowNumber, r.name, "created");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to save this row.";
          errors.push({ row: r.rowNumber, name: r.name, message });
          reportProgress(r.rowNumber, r.name, "error", message);
        }
      }
    }
  }

  return { created, errors };
}
