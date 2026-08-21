import { NextRequest, NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { attendanceCalculationFilterSchema } from "@/schemas/attendance.schema";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = attendanceCalculationFilterSchema.safeParse(params);
    if (!parsed.success) return NextResponse.json({ error: "Filter tidak valid.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const rows = await getAttendanceAdapter().getCalculatedAttendance(parsed.data);
    return NextResponse.json({ rows });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
