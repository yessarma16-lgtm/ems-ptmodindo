import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getMangkirThresholds, setMangkirThreshold, getMangkirSignerInfo, setMangkirSignerInfo } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Report Mangkir "Setup" — the two Surat Panggilan escalation thresholds (consecutive work days), plus who signs the letters. */
export async function GET() {
  try {
    await requireModuleAccess("attendanceReport");
    const [thresholds, signer] = await Promise.all([getMangkirThresholds(), getMangkirSignerInfo()]);
    return NextResponse.json({ ...thresholds, ...signer });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/** Body: either { level: 1 | 2, threshold: number } or { signerName, signerTitle }. */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const body = await request.json();

    if (body.signerName !== undefined || body.signerTitle !== undefined) {
      const signerName = String(body.signerName ?? "").trim();
      const signerTitle = String(body.signerTitle ?? "").trim();
      if (!signerName || !signerTitle) return NextResponse.json({ error: "Nama dan jabatan wajib diisi." }, { status: 400 });
      await setMangkirSignerInfo({ signerName, signerTitle });
      return NextResponse.json({ ok: true });
    }

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
