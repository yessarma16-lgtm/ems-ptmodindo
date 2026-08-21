import { NextRequest, NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const dateFrom = request.nextUrl.searchParams.get("dateFrom") || undefined;
    const dateTo = request.nextUrl.searchParams.get("dateTo") || undefined;
    const history = await getAttendanceAdapter().getImportHistory({ dateFrom, dateTo });
    return NextResponse.json({ history });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
