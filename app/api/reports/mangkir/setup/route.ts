import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getMangkirThresholds, setMangkirThreshold } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Report Mangkir "Setup" — the two Surat Panggilan escalation thresholds (consecutive work days). */
export async function GET() {
  try {
    await requireModuleAccess("attendanceReport");
    const thresholds = await getMangkirThresholds();
    return NextResponse.json(thresholds);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/** Body: { level: 1 | 2, threshold: number }. */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const body = await request.json();
    const level = Number(body.level);
    const threshold = Number(body.threshold);
    if (level !== 1 && level !== 2) return NextResponse.json({ error: "Invalid level." }, { status: 400 });
    if (!Number.isFinite(threshold) || threshold < 1) {
      return NextResponse.json({ error: "Threshold must be a positive number." }, { status: 400 });
    }
    await setMangkirThreshold(level as 1 | 2, threshold);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
