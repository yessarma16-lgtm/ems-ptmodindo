import { ALL_EMPLOYEE_FORM_FIELDS } from "@/config/employee-fields";

/**
 * Maps every Employee Form field key (config/employee-fields.ts, camelCase —
 * the 55 `db_mod.xlsx` fields plus any extra fields appended after them) to
 * SQLite column names (snake_case) — derived automatically so the SQLite
 * schema always stays in sync with the single source of truth without a
 * hand-maintained duplicate list.
 */
export function toSnakeCase(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

export interface EmployeeColumn {
  /** camelCase field key, matches config/employee-fields.ts and EmployeeRecord. */
  key: string;
  /** snake_case SQLite column name. */
  column: string;
  /** Auto-calculated fields (SN, AGE, MASA KERJA) are never written by user input. */
  readOnly: boolean;
}

export const EMPLOYEE_COLUMNS: EmployeeColumn[] = ALL_EMPLOYEE_FORM_FIELDS.map((f) => ({
  key: f.key,
  column: toSnakeCase(f.key),
  readOnly: !!f.readOnly,
}));

export const WRITABLE_EMPLOYEE_COLUMNS = EMPLOYEE_COLUMNS.filter((c) => !c.readOnly);
