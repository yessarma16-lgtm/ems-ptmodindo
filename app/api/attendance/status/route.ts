import { NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const processedDates = await getAttendanceAdapter().getProcessedDates();
    return NextResponse.json({ processedDates });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
