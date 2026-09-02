import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getMangkirThreshold, setMangkirThreshold } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Report Mangkir "Setup" — the consecutive-work-day threshold before an employee is flagged. */
export async function GET() {
  try {
    await requireModuleAccess("attendanceReport");
    const threshold = await getMangkirThreshold();
    return NextResponse.json({ threshold });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/** Body: { threshold: number }. */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const body = await request.json();
    const threshold = Number(body.threshold);
    if (!Number.isFinite(threshold) || threshold < 1) {
      return NextResponse.json({ error: "Threshold must be a positive number." }, { status: 400 });
    }
    await setMangkirThreshold(threshold);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
