import { NextRequest, NextResponse } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const bracketIdParam = request.nextUrl.searchParams.get("bracketId");
    const bracketId = bracketIdParam ? Number(bracketIdParam) : undefined;
    const history = await getAttendanceAdapter().getBracketMasterHistory(bracketId);
    return NextResponse.json({ history });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
