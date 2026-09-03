import { z } from "zod";

/**
 * Individual Access update — a PARTIAL module→level map (only the modules the
 * user overrides from their role). Unknown keys / an empty object are fine;
 * the store sanitizes against PERMISSION_MODULES before persisting.
 */
export const userAccessUpdateSchema = z.object({
  permissions: z.record(z.string(), z.enum(["edit", "view", "hidden"])),
});
