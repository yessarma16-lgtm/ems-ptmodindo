import { z } from "zod";

/** HR's minimal input to generate a shareable application link — the only 3 fields required before a link can be created. */
export const registrationInviteSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  hpNumber: z.string().trim().min(1, "HP Number is required"),
  position: z.string().trim().min(1, "Position is required"),
});

export type RegistrationInviteInput = z.infer<typeof registrationInviteSchema>;
