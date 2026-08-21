import { z } from "zod";

export const roleAccessUpdateSchema = z.object({
  permissions: z.record(z.string(), z.enum(["edit", "view", "hidden"])),
});
