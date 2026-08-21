import { z } from "zod";

/** Shared validation for adding/editing one probation/contract period. */
export const contractHistoryInputSchema = z.object({
  contractType: z.string().trim().min(1, "Contract type is required"),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
});

export type ContractHistoryFormValues = z.infer<typeof contractHistoryInputSchema>;
