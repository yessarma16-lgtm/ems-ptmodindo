import { NextResponse } from "next/server";

import { requireModuleAccess } from "@/lib/module-permission";
import { getActivityLogs } from "@/lib/database/postgres-activity-log";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    await requireModuleAccess("settingsDatabase");
    const pageValue = new URL(request.url).searchParams.get("page");
    const page = pageValue ? Number(pageValue) : 1;
    return NextResponse.json(await getActivityLogs(Number.isFinite(page) ? page : 1));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
