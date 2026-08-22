import "server-only";

import { createActivityLog } from "@/lib/database/postgres-activity-log";

/** Audit logging is best-effort: an activity failure must not make the user's actual action fail. */
export async function logActivity(user: string | undefined, activity: string): Promise<void> {
  try {
    await createActivityLog(user ?? "System", activity);
  } catch (error) {
    console.error("[activity-log] failed:", error);
  }
}
