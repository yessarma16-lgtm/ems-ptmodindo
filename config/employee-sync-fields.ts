import { getFieldByKey, type EmployeeField } from "@/config/employee-fields";

/**
 * Curated subset of ALL_EMPLOYEE_FORM_FIELDS synced from/to the "Employee Sync"
 * Google Sheet tab (see lib/employee-sync.ts). Deliberately narrow: only the
 * fields an admin commonly maintains for active/inactive lifecycle management,
 * not the full HR master record — tax, BPJS, family, address, etc. stay
 * dashboard-only and are never touched by sync.
 */
export const EMPLOYEE_SYNC_FIELD_KEYS = [
  "nik",
  "name",
  "category",
  "department",
  "position",
  "level",
  "type",
  "fingerCode",
  "joinDate",
  "contractStatus",
  "status",
  "exitDate",
  "reason",
  "ktpNo",
] as const;

export type EmployeeSyncFieldKey = (typeof EMPLOYEE_SYNC_FIELD_KEYS)[number];

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

export const EMPLOYEE_SYNC_FIELDS: EmployeeField[] = EMPLOYEE_SYNC_FIELD_KEYS.map((key) => {
  const field = getFieldByKey(key);
  if (!field) throw new Error(`Unknown employee field key in EMPLOYEE_SYNC_FIELD_KEYS: ${key}`);
  return field;
});
