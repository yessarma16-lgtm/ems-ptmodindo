import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getTimeOverdueFilterDurations, setTimeOverdueFilterDuration } from "@/lib/ot-planning-service";
import { getTimeOverdueZeroFilter, setTimeOverdueZeroFilter } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Report Time Overdue "Setup" tab — list every duration + its filter checkbox state. */
export async function GET() {
  try {
    await requireModuleAccess("reportSetup");
    const [durations, othZeroFilter] = await Promise.all([getTimeOverdueFilterDurations(), getTimeOverdueZeroFilter()]);
    return NextResponse.json({ durations, othZeroFilter });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/** Toggles one duration's Time Overdue filter checkbox. Body: { duration, timeOverdueFilter }. */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("reportSetup");
    const body = await request.json();
    if (body.othZeroFilter !== undefined) {
      await setTimeOverdueZeroFilter(Boolean(body.othZeroFilter));
      return NextResponse.json({ ok: true });
    }
    const duration = Number(body.duration);
    if (!Number.isFinite(duration)) return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
    await setTimeOverdueFilterDuration(duration, Boolean(body.timeOverdueFilter));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
