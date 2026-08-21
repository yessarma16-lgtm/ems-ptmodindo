import { NextRequest, NextResponse } from "next/server";

import { updateBracketMasterSchema } from "@/schemas/attendance.schema";
import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { toApiErrorResponse } from "@/lib/api-error";
import type { DayType } from "@/lib/attendance/day-type";

const VALID_DAY_TYPES: DayType[] = ["Senin-Jumat", "Sabtu", "Minggu"];

export async function GET(request: NextRequest) {
  try {
    const dayTypeParam = request.nextUrl.searchParams.get("dayType");
    const dayType = dayTypeParam && (VALID_DAY_TYPES as string[]).includes(dayTypeParam) ? (dayTypeParam as DayType) : undefined;
    const rows = await getAttendanceAdapter().getBracketMaster(dayType);
    return NextResponse.json({ rows });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

/** Bulk create/update/delete untuk day_type yang muncul di body -- lihat updateBracketMaster() di AttendanceDatabaseAdapter. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateBracketMasterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const user = await getCurrentSessionUser();
    await getAttendanceAdapter().updateBracketMaster(
      parsed.data.rows,
      user?.name ?? parsed.data.changedBy ?? "SYSTEM",
      parsed.data.dayTypes,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
