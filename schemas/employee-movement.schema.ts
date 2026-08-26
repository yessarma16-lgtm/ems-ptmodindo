import { z } from "zod";

export const employeeMovementInputSchema = z.object({
  movementType: z.enum(["Promosi", "Demosi", "Mutasi", "Permanent"]),
  effectiveDate: z.string().trim().min(1, "Effective Date is required."),
  lastDepartment: z.string().trim().default(""),
  lastPosition: z.string().trim().default(""),
  newDepartment: z.string().trim().default(""),
  newPosition: z.string().trim().default(""),
});

export type EmployeeMovementInput = z.infer<typeof employeeMovementInputSchema>;
