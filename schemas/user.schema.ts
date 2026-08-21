import { z } from "zod";

import { USER_ROLES } from "@/config/user-roles";

const userBaseSchema = z.object({
  name: z.string().trim().min(1, "Full name is required").max(120, "Name is too long"),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(60, "Username is too long")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, dashes, and underscores"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  role: z.enum(USER_ROLES, { message: "Select a role" }),
});

/** Create: password required. */
export const userInputSchema = userBaseSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Update: everything optional, password only when resetting it. */
export const userUpdateSchema = userBaseSchema.partial().extend({
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export type UserInput = z.infer<typeof userInputSchema>;
