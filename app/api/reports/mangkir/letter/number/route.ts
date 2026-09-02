import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { saveMangkirLetterNumber } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Saves the free-text Surat Panggilan number HR types in before downloading the PDF. Body: { recordId, nik, level, episodeStartDate, triggerDates, letterNumber }. */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const body = await request.json();
    const level = Number(body.level);
    if (level !== 1 && level !== 2) return NextResponse.json({ error: "Invalid level." }, { status: 400 });
    if (!body.recordId || !body.nik || !body.episodeStartDate) {
      return NextResponse.json({ error: "Invalid event." }, { status: 400 });
    }
    await saveMangkirLetterNumber({
      recordId: body.recordId,
      nik: body.nik,
      level: level as 1 | 2,
      episodeStartDate: body.episodeStartDate,
      triggerDates: Array.isArray(body.triggerDates) ? body.triggerDates : [],
      letterNumber: String(body.letterNumber ?? "").trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
