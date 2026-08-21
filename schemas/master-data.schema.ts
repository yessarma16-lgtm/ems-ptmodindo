import { z } from "zod";

/** Shared validation for creating/editing a Departments/Positions/Levels/Skills/Bank/Lookup item. */
export const masterDataInputSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(30, "Code is too long"),
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  sortOrder: z.coerce.number().int().min(0).optional(),
  /** Only required when the category is "lookup". */
  type: z.string().trim().optional(),
});

export type MasterDataInput = z.infer<typeof masterDataInputSchema>;
