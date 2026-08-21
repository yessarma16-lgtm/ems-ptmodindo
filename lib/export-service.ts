import "server-only";

import { getEmployees, type EmployeeRecord } from "@/lib/employee-service";
import { getTemplateById, type ExportTemplateDetail } from "@/lib/export-template-service";
import { isValidEmployeeFieldKey } from "@/schemas/export-template.schema";
import { buildExportData, type ExportMatrix } from "@/lib/export-data-builder";
import { generateWorkbookBuffer, buildExportFilename } from "@/lib/excel-generator";
import { writeAuditLog } from "@/lib/database/audit-log";
import { getDatabaseProvider } from "@/lib/database/database";
import type { ExportFilters, ExportRequestInput } from "@/schemas/export.schema";

/**
 * Export Engine orchestration (STEP 4) — the only module API routes call
 * for turning an Export Template + a data-selection request into a Preview
 * payload or a generated Excel file.
 *
 *   UI -> API Route -> Export Service (this file) -> Export Data Builder -> Excel Generator
 *                                    \-> Employee Service (existing, STEP 1/2.5)
 *                                    \-> Export Template Service (existing, STEP 3)
 *
 * Preview and Generate call the exact same `getExportTemplate` /
 * `getExportEmployees` / `buildExportData` pipeline — the only difference is
 * what the API route does with the resulting ExportMatrix afterward (trim
 * for a JSON preview vs. hand the whole thing to the Excel generator).
 */

export class ExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportValidationError";
  }
}

const ILLEGAL_SHEET_NAME_CHARS = /[\\/?*[\]:]/;

/** Structural checks only (template shape) — never touches employee data. Shared by preview and generate. */
function validateTemplateForExport(template: ExportTemplateDetail | null): asserts template is ExportTemplateDetail {
  if (!template) throw new ExportValidationError("Export template not found.");
  if (template.status.toLowerCase() !== "active") throw new ExportValidationError("Export template is not active.");
  if (template.sheets.length === 0) throw new ExportValidationError("Template has no sheets.");

  const seenNames = new Set<string>();
  for (const sheet of template.sheets) {
    const trimmed = sheet.name.trim();
    if (!trimmed) throw new ExportValidationError("A sheet has an empty name.");
    if (trimmed.length > 31) throw new ExportValidationError(`Sheet name "${sheet.name}" exceeds Excel's 31-character limit.`);
    if (ILLEGAL_SHEET_NAME_CHARS.test(trimmed)) {
      throw new ExportValidationError(`Sheet name "${sheet.name}" contains characters Excel does not allow (\\ / ? * [ ] :).`);
    }
    const key = trimmed.toLowerCase();
    if (seenNames.has(key)) throw new ExportValidationError(`Duplicate sheet name "${sheet.name}".`);
    seenNames.add(key);

    if (sheet.columns.length === 0) {
      throw new ExportValidationError(`Sheet "${sheet.name}" has no columns configured.`);
    }
    for (const col of sheet.columns) {
      if (col.columnType === "FIELD" && (!col.sourceField || !isValidEmployeeFieldKey(col.sourceField))) {
        throw new ExportValidationError(`Sheet "${sheet.name}" has a column with an invalid source field.`);
      }
    }
  }
}

/** Loads a template by ID — no validation, callers decide what to require. */
export function getExportTemplate(templateId: string): ExportTemplateDetail | null {
  return getTemplateById(templateId);
}

function matchesFilters(employee: EmployeeRecord, filters: ExportFilters): boolean {
  const search = (filters.search ?? "").trim().toLowerCase();
  if (search) {
    const haystack = `${employee.nik ?? ""} ${employee.name ?? ""}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.department && employee.department !== filters.department) return false;
  if (filters.position && employee.position !== filters.position) return false;
  if (filters.level && employee.level !== filters.level) return false;
  if (filters.status && employee.status !== filters.status) return false;
  return true;
}

/**
 * Resolves the selection mode against the real employee dataset. Fetches
 * the full employee list exactly once (STEP 4 requirement — no per-employee
 * database queries), then filters in memory. `employeeIds` / `filters` are a
 * whitelist match against real records, never a raw query — an unknown or
 * forged ID simply matches nothing.
 */
export async function getExportEmployees(input: ExportRequestInput): Promise<EmployeeRecord[]> {
  const all = await getEmployees();

  if (input.selectionMode === "ALL_ACTIVE") {
    // Matches the app-wide "Active" convention (dashboard stats, Active Employees list):
    // anything other than an explicit "Inactive" status counts as active.
    return all.filter((e) => (e.status ?? "").toLowerCase() !== "inactive");
  }
  if (input.selectionMode === "SELECTED") {
    const idSet = new Set(input.employeeIds ?? []);
    return all.filter((e) => idSet.has(e.recordId));
  }
  // FILTERED
  const filters = input.filters ?? {};
  return all.filter((e) => matchesFilters(e, filters));
}

export interface ExportPreviewResult {
  matrix: ExportMatrix;
}

/** Preview never throws for "no employees" — it returns an empty-but-valid matrix so the UI can show a friendly message. */
export async function buildExportPreview(input: ExportRequestInput): Promise<ExportPreviewResult> {
  const template = getExportTemplate(input.templateId);
  validateTemplateForExport(template);

  const employees = await getExportEmployees(input);
  const matrix = buildExportData(template, employees);

  if (getDatabaseProvider() === "sqlite") {
    writeAuditLog("EXPORT_PREVIEW", "ExportTemplate", template.id, {
      template_name: template.name,
      employee_count: employees.length,
    });
  }

  return { matrix };
}

export interface GeneratedExport {
  buffer: Buffer;
  filename: string;
}

/** Generate always uses the full selected data set (never truncated) and hard-fails on zero matching employees. */
export async function generateExcel(input: ExportRequestInput): Promise<GeneratedExport> {
  const template = getExportTemplate(input.templateId);
  validateTemplateForExport(template);

  const employees = await getExportEmployees(input);
  if (employees.length === 0) {
    throw new ExportValidationError("No employees match the selected criteria.");
  }

  const matrix = buildExportData(template, employees);
  const buffer = await generateWorkbookBuffer(matrix);
  const filename = buildExportFilename(template.name);

  if (getDatabaseProvider() === "sqlite") {
    writeAuditLog("EXPORT_GENERATED", "ExportTemplate", template.id, {
      template_name: template.name,
      employee_count: employees.length,
      filename,
    });
  }

  return { buffer, filename };
}
