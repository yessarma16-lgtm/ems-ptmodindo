import { z } from "zod";

import { ALL_EMPLOYEE_FORM_FIELDS } from "@/config/employee-fields";

const VALID_FIELD_KEYS = new Set(ALL_EMPLOYEE_FORM_FIELDS.map((f) => f.key));

/** True when `key` is a real Employee Form field key from config/employee-fields.ts. */
export function isValidEmployeeFieldKey(key: string): boolean {
  return VALID_FIELD_KEYS.has(key);
}

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(120, "Template name is too long"),
  description: z.string().trim().max(500, "Description is too long").optional().default(""),
  keyField: z
    .string()
    .trim()
    .min(1, "Employee key is required")
    .refine(isValidEmployeeFieldKey, { message: "Employee key must be a valid Employee field." })
    .optional()
    .default("nik"),
});

export const templateUpdateSchema = templateInputSchema.partial();

export const sheetInputSchema = z.object({
  name: z.string().trim().min(1, "Sheet name is required").max(80, "Sheet name is too long"),
});

/**
 * FIELD   — value comes from an Employee record field (source_field).
 * BLANK   — always empty; a spacer column.
 * STATIC  — admin-typed free text (blank_value); every exported row gets
 *           this exact same constant value ("Add Other Column").
 */
const columnBaseSchema = z.object({
  columnType: z.enum(["FIELD", "BLANK", "STATIC"]),
  sourceField: z.string().trim().nullable().optional(),
  displayLabel: z.string().trim().max(120).optional().default(""),
  isKey: z.boolean().optional().default(false),
  blankValue: z.string().max(200).optional().default(""),
});

/** Used when creating a column — columnType is always known, so FIELD/BLANK/STATIC rules are fully enforced. */
export const columnInputSchema = columnBaseSchema.superRefine((val, ctx) => {
  if (val.columnType === "FIELD") {
    if (!val.sourceField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_field is required for FIELD columns.",
        path: ["sourceField"],
      });
    } else if (!isValidEmployeeFieldKey(val.sourceField)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_field must be a valid Employee field.",
        path: ["sourceField"],
      });
    }
  }
  if (val.columnType === "STATIC" && !val.displayLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Column name is required for a custom column.",
      path: ["displayLabel"],
    });
  }
});

/** Used when patching a column — every field optional; only validates sourceField content if provided. */
export const columnUpdateSchema = columnBaseSchema.partial().superRefine((val, ctx) => {
  if (val.sourceField && !isValidEmployeeFieldKey(val.sourceField)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "source_field must be a valid Employee field.",
      path: ["sourceField"],
    });
  }
  if (val.columnType === "FIELD" && val.sourceField === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "source_field is required for FIELD columns.",
      path: ["sourceField"],
    });
  }
});

export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, "Nothing to reorder."),
});
