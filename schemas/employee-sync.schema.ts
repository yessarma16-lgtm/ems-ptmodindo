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
