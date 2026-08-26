import { ALL_EMPLOYEE_FORM_FIELDS, type EmployeeField } from "@/config/employee-fields";

/**
 * Every field on the Employee Form is sync-eligible — the "Employee Sync"
 * Google Sheet tab mirrors the Employee Form 1:1 (same ~60 columns, same
 * labels), so admins can maintain a full employee record from the sheet, not
 * just a lifecycle subset. See lib/employee-sync.ts for the diff/commit
 * engine this drives.
 */
/**
 * Fields dropped from sync entirely — never read from the sheet, never
 * validated, never diffed. POSITION APPLIED / INTERVIEW EVALUATION belong to
 * the recruitment flow, not ongoing employee lifecycle management.
 *
 * PERMANEN DATE is deliberately NOT here (it used to be) — an admin setting
 * CONTRACT STATUS to "Permanent" + PERMANEN DATE in the sheet is exactly how
 * the "Permanent" Employee Movement History entry gets triggered on sync
 * (see autoLogPermanentMovement in lib/employee-movement-service.ts, called
 * from lib/employee-sync.ts's commitEmployeeSync).
 */
const SYNC_EXCLUDED_KEYS = new Set(["positionApplied", "interviewEvaluation"]);

/** Excludes readOnly fields (SN, AGE, MASA KERJA) — same convention as Import's WRITABLE_FIELDS; these are system-calculated, never admin input. */
export const EMPLOYEE_SYNC_FIELDS: EmployeeField[] = ALL_EMPLOYEE_FORM_FIELDS.filter(
  (f) => !f.readOnly && !SYNC_EXCLUDED_KEYS.has(f.key),
);

export const EMPLOYEE_SYNC_FIELD_KEYS: string[] = EMPLOYEE_SYNC_FIELDS.map((f) => f.key);

/**
 * CONTRACT CLOSE-FIRST/SECOND/THIRD/FOURTH/FIVETH stay part of the sync
 * output (needed so the Contract Criteria auto-calc's fill-in shows up as a
 * diff — see applyContractCriteriaCalc in lib/employee-sync.ts) but their
 * SHEET COLUMN is ignored even if present — these are computed-only, never
 * admin input from the sheet. See readEmployeeSyncSheet in
 * lib/employee-sync-sheet.ts, which skips mapping these columns.
 */
export const EMPLOYEE_SYNC_UNMAPPED_COLUMN_KEYS = new Set([
  "contractCloseFirst",
  "contractCloseSecond",
  "contractCloseThird",
  "contractCloseFourth",
  "contractCloseFiveth",
]);

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
