import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { markMangkirLetterSent } from "@/lib/mangkir-service";
import { buildWhatsAppLink } from "@/lib/mangkir-letter";
import type { MangkirEvent } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Records that a Surat Panggilan's "Kirim via WhatsApp" action was used, and
 * returns the wa.me link to open. Not a delivery confirmation — wa.me only
 * pre-fills WhatsApp with the message, HR still sends it manually there.
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

    const whatsappLink = buildWhatsAppLink(event);
    if (!whatsappLink) return NextResponse.json({ error: "Karyawan ini belum punya nomor HP." }, { status: 400 });

    await markMangkirLetterSent({
      recordId: event.recordId,
      nik: event.nik,
      level: event.level,
      episodeStartDate: event.episodeStartDate,
      triggerDates: event.triggerDates,
      sentBy: user?.name ?? "",
      phoneNumber: event.phoneNumber,
    });

    return NextResponse.json({ whatsappLink });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
