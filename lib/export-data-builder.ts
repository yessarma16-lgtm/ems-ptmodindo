import { getFieldByKey } from "@/config/employee-fields";
import type { ExportTemplateDetail, ExportTemplateColumn, ColumnType } from "@/lib/export-template-service";
import type { EmployeeRecord } from "@/lib/employee-service";

/**
 * Turns an Export Template + a resolved employee list into a flat, ordered
 * matrix — the single transformation both the Preview API and the Excel
 * Generator read from. Neither one re-derives labels/values on its own, so
 * what an admin sees in Preview is guaranteed to be exactly what ends up in
 * the downloaded file (STEP 4 requirement: one engine, two consumers).
 */

export interface ExportMatrixColumn {
  columnType: ColumnType;
  sourceField: string | null;
  /** Resolved Excel header: displayLabel, falling back to the field's config label. */
  label: string;
  isKey: boolean;
  /** Drives Excel cell formatting — only "date" fields get a real Excel date type. */
  dataType: "text" | "date";
}

export interface ExportMatrixSheet {
  name: string;
  columns: ExportMatrixColumn[];
  /** rows[i][j] is the resolved string value for columns[j], employee i. */
  rows: string[][];
}

export interface ExportMatrix {
  templateName: string;
  employeeCount: number;
  sheets: ExportMatrixSheet[];
}

function resolveColumnLabel(column: ExportTemplateColumn): string {
  if (column.columnType === "BLANK") return column.displayLabel ?? "";
  if (column.displayLabel?.trim()) return column.displayLabel;
  if (column.columnType === "STATIC") return "";
  const field = column.sourceField ? getFieldByKey(column.sourceField) : undefined;
  return field?.label ?? column.sourceField ?? "";
}

function resolveColumnDataType(column: ExportTemplateColumn): "text" | "date" {
  if (column.columnType !== "FIELD" || !column.sourceField) return "text";
  return getFieldByKey(column.sourceField)?.type === "date" ? "date" : "text";
}

function resolveCellValue(column: ExportTemplateColumn, employee: EmployeeRecord): string {
  if (column.columnType === "BLANK") return "";
  if (column.columnType === "STATIC") return column.blankValue ?? "";
  if (!column.sourceField) return "";
  return employee[column.sourceField] ?? "";
}

/** Pure transformation — no database access, no I/O. Trusts the template's own column/sheet order. */
export function buildExportData(template: ExportTemplateDetail, employees: EmployeeRecord[]): ExportMatrix {
  const sheets: ExportMatrixSheet[] = template.sheets.map((sheet) => {
    const columns: ExportMatrixColumn[] = sheet.columns.map((col) => ({
      columnType: col.columnType,
      sourceField: col.sourceField,
      label: resolveColumnLabel(col),
      isKey: col.isKey,
      dataType: resolveColumnDataType(col),
    }));

    const rows: string[][] = employees.map((employee) => sheet.columns.map((col) => resolveCellValue(col, employee)));

    return { name: sheet.name, columns, rows };
  });

  return {
    templateName: template.name,
    employeeCount: employees.length,
    sheets,
  };
}
