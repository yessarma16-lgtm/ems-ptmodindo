import { NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const rows = await getAttendanceAdapter().getCalculatedAttendance({});
    const processedDates = Array.from(new Set(rows.map((row) => row.tanggal)));
    return NextResponse.json({ processedDates });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
