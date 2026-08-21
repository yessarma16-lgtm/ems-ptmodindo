import "server-only";
import ExcelJS from "exceljs";

import type { ExportMatrix, ExportMatrixSheet } from "@/lib/export-data-builder";

/**
 * ExportMatrix -> ExcelJS -> Buffer. The only responsibility here is
 * formatting an already-resolved matrix into a workbook — no database
 * access, no template/employee loading (that's `lib/export-service.ts`).
 *
 * STEP 4 scope: basic formatting only — bold header, frozen first row,
 * simple bounded auto-width, a real Excel date type for date columns, and
 * text format everywhere else (protects values like NIK from losing
 * leading zeros). No logos, merges, formulas, or custom colors — that's a
 * later step.
 */

const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 40;

/** Single place to change the default Excel date display format. */
export function formatExcelDate(): string {
  return "dd/mm/yyyy";
}

function parseDateValue(raw: string): Date | null {
  if (!raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeColumnWidth(header: string, values: string[]): number {
  let maxLen = header.length;
  for (const v of values) {
    if (v.length > maxLen) maxLen = v.length;
  }
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, maxLen + 2));
}

function addSheet(workbook: ExcelJS.Workbook, sheet: ExportMatrixSheet): void {
  const worksheet = workbook.addWorksheet(sheet.name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = sheet.columns.map((col, idx) => ({
    header: col.label,
    key: `c${idx}`,
    width: computeColumnWidth(col.label, sheet.rows.map((r) => r[idx] ?? "")),
  }));

  worksheet.getRow(1).font = { bold: true };

  for (const rowValues of sheet.rows) {
    const converted: (string | Date)[] = rowValues.map((raw, idx) => {
      const dataType = sheet.columns[idx]?.dataType;
      if (dataType === "date") {
        const parsed = parseDateValue(raw);
        if (parsed) return parsed;
      }
      return raw;
    });
    worksheet.addRow(converted);
  }

  sheet.columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).numFmt = col.dataType === "date" ? formatExcelDate() : "@";
  });
}

/** Builds the full workbook in memory and returns it as a Buffer — never writes to disk. */
export async function generateWorkbookBuffer(matrix: ExportMatrix): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Employee Management System";
  workbook.created = new Date();

  for (const sheet of matrix.sheets) {
    addSheet(workbook, sheet);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** `<TemplateName>_<YYYYMMDD_HHmmss>.xlsx`, sanitized for Windows filenames. */
export function buildExportFilename(templateName: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const safeName = templateName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);

  return `${safeName || "Export"}_${timestamp}.xlsx`;
}
