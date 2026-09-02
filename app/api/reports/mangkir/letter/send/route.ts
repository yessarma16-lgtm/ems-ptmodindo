import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { markMangkirLetterSent, getMangkirLetterMeta, getMangkirSignerInfo } from "@/lib/mangkir-service";
import { buildWhatsAppLinks } from "@/lib/mangkir-letter";
import type { MangkirEvent } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Records that a Surat Panggilan's "Kirim via WhatsApp" action was used, and
 * returns both the WhatsApp Web and the WhatsApp app links to open (HR picks
 * which in the dialog). Not a delivery confirmation — the link only pre-fills
 * WhatsApp with the message, HR still sends it manually there.
 */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const user = await getCurrentSessionUser();
    const body = await request.json();
    const event = body.event as MangkirEvent | undefined;
    if (!event?.recordId || !event?.nik || (event.level !== 1 && event.level !== 2)) {
      return NextResponse.json({ error: "Invalid event." }, { status: 400 });
    }

    // Fetch the letter number / (for level 2) SP1's sent date fresh from the DB — same reasoning as the PDF route.
    const [{ letterNumber, previousLevelSentAt }, signer] = await Promise.all([
      getMangkirLetterMeta(event.recordId, event.episodeStartDate, event.level),
      getMangkirSignerInfo(),
    ]);
    const fullEvent: MangkirEvent = { ...event, letterNumber, previousLevelSentAt };

    const whatsappLinks = buildWhatsAppLinks(fullEvent, signer);
    if (!whatsappLinks) return NextResponse.json({ error: "Karyawan ini belum punya nomor HP." }, { status: 400 });

    const sentAt = new Date().toISOString();
    const sentBy = user?.name ?? "";
    await markMangkirLetterSent({
      recordId: event.recordId,
      nik: event.nik,
      level: event.level,
      episodeStartDate: event.episodeStartDate,
      triggerDates: event.triggerDates,
      sentAt,
      sentBy,
      phoneNumber: event.phoneNumber,
    });

    return NextResponse.json({ whatsappWebLink: whatsappLinks.web, whatsappAppLink: whatsappLinks.app, sentAt, sentBy });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
