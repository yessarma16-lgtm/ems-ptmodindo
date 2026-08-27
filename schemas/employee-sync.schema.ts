import { z } from "zod";

import { EMPLOYEE_SYNC_FIELDS, EMPLOYEE_SYNC_REQUIRED_KEYS } from "@/config/employee-sync-fields";

const requiredKeys = new Set<string>(EMPLOYEE_SYNC_REQUIRED_KEYS);

const shape: Record<string, z.ZodTypeAny> = {};
for (const field of EMPLOYEE_SYNC_FIELDS) {
  shape[field.key] = requiredKeys.has(field.key)
    ? z.string({ required_error: `${field.label} is required` }).trim().min(1, `${field.label} is required`)
    : z.string().trim().optional().or(z.literal(""));
}

/** One row read from the "Employee Sync" sheet tab. */
export const employeeSyncRowSchema = z.object(shape);
export type EmployeeSyncRowValues = z.infer<typeof employeeSyncRowSchema>;

/**
 * Same shape, relaxed requirements — for a row whose STATUS cell marks it as
 * exiting ("EXIT"/"Inactive"). Only NIK and EXIT DATE are required; every
 * other column (name, department, position, join date, finger code, ...) is
 * optional, since an admin marking someone as exited from the sheet
 * shouldn't need the rest of that row filled in correctly first. See
 * lib/employee-sync.ts's EXIT_STATUS_VALUES / previewEmployeeSync for how
 * this gets selected and how blank cells are handled (existing data
 * preserved, never cleared).
 */
const exitRequiredKeys = new Set<string>(["nik", "exitDate"]);
const exitShape: Record<string, z.ZodTypeAny> = {};
for (const field of EMPLOYEE_SYNC_FIELDS) {
  exitShape[field.key] = exitRequiredKeys.has(field.key)
    ? z.string({ required_error: `${field.label} is required` }).trim().min(1, `${field.label} is required`)
    : z.string().trim().optional().or(z.literal(""));
}
export const employeeSyncExitRowSchema = z.object(exitShape);

const syncRowRef = z.object({
  rowNumber: z.number(),
  nik: z.string(),
  incoming: z.record(z.string(), z.string()),
});
const syncMatchedRowRef = z.object({
  rowNumber: z.number(),
  nik: z.string(),
  recordId: z.string(),
  incoming: z.record(z.string(), z.string()),
});

/** Body for POST /api/employees/sync/commit — the row groups from the preview response, plus the admin's per-row apply/skip decisions (keyed by NIK). */
export const employeeSyncCommitSchema = z.object({
  newRows: z.array(syncRowRef),
  changedRows: z.array(syncMatchedRowRef),
  inactivatedRows: z.array(syncMatchedRowRef),
  decisions: z.record(z.string(), z.enum(["apply", "skip"])),
});
export type EmployeeSyncCommitInput = z.infer<typeof employeeSyncCommitSchema>;
