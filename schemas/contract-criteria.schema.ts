import { z } from "zod";

export const contractPeriodRuleSchema = z.object({
  value: z.coerce.number().int().positive("Must be a positive whole number."),
  unit: z.enum(["month", "year"]),
});

/** Body for POST/PUT /api/master-data/contract-criteria[/:id]. */
export const contractCriteriaInputSchema = z.object({
  code: z.string().trim().min(1, "Code is required."),
  name: z.string().trim().min(1, "Name is required."),
  periods: z.array(contractPeriodRuleSchema).min(1, "At least one period is required."),
  appliesToStatus: z.string().trim().min(1, "Applies-to Contract Status is required."),
  sortOrder: z.coerce.number().int().optional(),
});

export type ContractCriteriaInput = z.infer<typeof contractCriteriaInputSchema>;
