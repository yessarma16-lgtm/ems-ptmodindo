import { ALL_EMPLOYEE_FORM_FIELDS, type EmployeeField } from "@/config/employee-fields";

/**
 * Every field on the Employee Form is sync-eligible — the "Employee Sync"
 * Google Sheet tab mirrors the Employee Form 1:1 (same ~60 columns, same
 * labels), so admins can maintain a full employee record from the sheet, not
 * just a lifecycle subset. See lib/employee-sync.ts for the diff/commit
 * engine this drives.
 */
/** Excludes readOnly fields (SN, AGE, MASA KERJA) — same convention as Import's WRITABLE_FIELDS; these are system-calculated, never admin input. */
export const EMPLOYEE_SYNC_FIELDS: EmployeeField[] = ALL_EMPLOYEE_FORM_FIELDS.filter((f) => !f.readOnly);

export const EMPLOYEE_SYNC_FIELD_KEYS: string[] = EMPLOYEE_SYNC_FIELDS.map((f) => f.key);

export type EmployeeSyncFieldKey = string;

/**
 * Required for a sync row to create/match an employee. KTP NO. is normally
 * required by employeeSchema but deliberately relaxed here — a sync-created
 * employee can have it filled in later on the dashboard.
 */
export const EMPLOYEE_SYNC_REQUIRED_KEYS: EmployeeSyncFieldKey[] = [
  "nik",
  "name",
  "department",
  "position",
  "joinDate",
  "fingerCode",
];
