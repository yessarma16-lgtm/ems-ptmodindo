import { NextRequest, NextResponse } from "next/server";

import { attendanceCorrectionSchema } from "@/schemas/attendance.schema";
import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const parsed = attendanceCorrectionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Koreksi tidak valid.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const user = await getCurrentSessionUser();
    const adapter = getAttendanceAdapter();
    await adapter.updateRawAttendanceTimes(parsed.data.rawId, parsed.data.it1, parsed.data.ot1);
    await adapter.runCrosscheck([parsed.data.rawId]);
    await adapter.correctFinalOth(parsed.data.id, parsed.data.newValue, parsed.data.note, user?.name ?? "SYSTEM");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
