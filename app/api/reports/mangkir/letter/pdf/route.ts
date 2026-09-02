import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { buildMangkirLetterPdf } from "@/lib/mangkir-letter";
import { getMangkirLetterMeta, getMangkirSignerInfo } from "@/lib/mangkir-service";
import type { MangkirEvent } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

// PDFKit requires Node's stream/buffer APIs and cannot run in an Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Formal Surat Panggilan PDF for HR's printed/filed copy — display fields
 * (name, address, dates, ...) come from query params (the same event data
 * the Report Mangkir table already has), but the letter number and — for a
 * level 2 letter — the level 1 letter's sent date are looked up fresh from
 * the DB rather than trusted from the client, since both carry real
 * document/legal weight.
 */
export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const sp = request.nextUrl.searchParams;
    const level = Number(sp.get("level"));
    if (level !== 1 && level !== 2) return NextResponse.json({ error: "Invalid level." }, { status: 400 });
    const recordId = sp.get("recordId") ?? "";
    const episodeStartDate = sp.get("episodeStartDate") ?? "";

    const [{ letterNumber, previousLevelSentAt }, signer] = await Promise.all([
      getMangkirLetterMeta(recordId, episodeStartDate, level as 1 | 2),
      getMangkirSignerInfo(),
    ]);

    const event: MangkirEvent = {
      recordId,
      nik: sp.get("nik") ?? "",
      name: sp.get("name") ?? "",
      position: sp.get("position") ?? "",
      department: sp.get("department") ?? "",
      address: sp.get("address") ?? "",
      shed: sp.get("shed") ?? "",
      division: sp.get("division") ?? "",
      phoneNumber: sp.get("phoneNumber") ?? "",
      level: level as 1 | 2,
      episodeStartDate,
      triggerDates: (sp.get("dates") ?? "").split(",").filter(Boolean),
      episodeLength: 0,
      sentAt: null,
      sentBy: null,
      letterNumber,
      previousLevelSentAt,
    };

    const buffer = await buildMangkirLetterPdf(event, signer);
    if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("PDF generator returned an invalid document");
    }
    const filenameSafe = (event.nik || "surat").replace(/[^a-zA-Z0-9-]+/g, "-");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="surat-panggilan-${event.level}-${filenameSafe}.pdf"`,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
