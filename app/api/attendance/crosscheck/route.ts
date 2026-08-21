import { NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST() {
  try {
    const summary = await getAttendanceAdapter().runCrosscheck();
    return NextResponse.json({ summary });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
