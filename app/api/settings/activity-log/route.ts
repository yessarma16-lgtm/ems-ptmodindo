import { NextResponse } from "next/server";

import { requireModuleAccess } from "@/lib/module-permission";
import { getActivityLogs } from "@/lib/database/postgres-activity-log";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    await requireModuleAccess("settingsDatabase");
    return NextResponse.json({ logs: await getActivityLogs() });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
