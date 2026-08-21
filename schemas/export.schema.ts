import { z } from "zod";

/**
 * Request shape shared by POST /api/export/preview and POST /api/export/generate.
 * The client only ever sends: which template, which selection mode, and
 * (depending on mode) either explicit employee IDs or a whitelist of filter
 * fields — never a raw query. See lib/export-service.ts for how each mode
 * resolves against the real employee dataset.
 */

export const exportFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  department: z.string().trim().max(200).optional(),
  position: z.string().trim().max(200).optional(),
  level: z.string().trim().max(200).optional(),
  status: z.string().trim().max(200).optional(),
});

export type ExportFilters = z.infer<typeof exportFiltersSchema>;

export const exportRequestSchema = z
  .object({
    templateId: z.string().trim().min(1, "Template is required."),
    selectionMode: z.enum(["ALL_ACTIVE", "SELECTED", "FILTERED"]),
    employeeIds: z.array(z.string().trim().min(1)).max(10000).optional(),
    filters: exportFiltersSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.selectionMode === "SELECTED" && (!val.employeeIds || val.employeeIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one employee.",
        path: ["employeeIds"],
      });
    }
  });

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
