import { NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const history = await getAttendanceAdapter().getImportHistory();
    return NextResponse.json({ history });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
