import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { buildMangkirLetterPdf } from "@/lib/mangkir-letter";
import type { MangkirEvent } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

// PDFKit requires Node's stream/buffer APIs and cannot run in an Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Formal Surat Panggilan PDF for HR's printed/filed copy — built entirely from query params (the same event data the Report Mangkir table already has), no DB round trip needed. */
export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const sp = request.nextUrl.searchParams;
    const level = Number(sp.get("level"));
    if (level !== 1 && level !== 2) return NextResponse.json({ error: "Invalid level." }, { status: 400 });

    const event: MangkirEvent = {
      recordId: sp.get("recordId") ?? "",
      nik: sp.get("nik") ?? "",
      name: sp.get("name") ?? "",
      position: sp.get("position") ?? "",
      department: sp.get("department") ?? "",
      shed: "",
      division: "",
      phoneNumber: sp.get("phoneNumber") ?? "",
      level: level as 1 | 2,
      episodeStartDate: sp.get("episodeStartDate") ?? "",
      triggerDates: (sp.get("dates") ?? "").split(",").filter(Boolean),
      episodeLength: 0,
      sentAt: null,
      sentBy: null,
    };

    const buffer = await buildMangkirLetterPdf(event);
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
