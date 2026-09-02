// @ts-expect-error pdfkit does not ship a declaration for its standalone entry.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import { formatDateDMY } from "@/lib/date-format";
import type { MangkirEvent } from "@/lib/mangkir-service";

/**
 * Surat Panggilan (warning letter) content for a Report Mangkir event —
 * shared source of truth for both the formal PDF (for HR's physical/file
 * record) and the WhatsApp text message (sent directly to the employee via
 * a wa.me link — plain text only, no attachment, so it's a notification of
 * the same content rather than the filed document itself).
 */

const COMPANY_NAME = "PT MOD INDO";

const RESPONSE_DEADLINE_DAYS = 3;

function levelTitle(level: 1 | 2): string {
  return level === 1 ? "Surat Panggilan Ke-1" : "Surat Panggilan Ke-2";
}

function bodyParagraphs(event: MangkirEvent): string[] {
  const dateList = event.triggerDates.map((d) => `- ${formatDateDMY(d)}`).join("\n");
  const paragraphs = [
    `Sehubungan dengan tercatatnya ketidakhadiran Saudara/i tanpa keterangan (Mangkir) pada tanggal:`,
    dateList,
    `Bersama surat ini kami sampaikan ${levelTitle(event.level)} kepada Saudara/i untuk segera melapor dan memberikan keterangan kepada pihak HRD/Personalia selambat-lambatnya dalam waktu ${RESPONSE_DEADLINE_DAYS} (${RESPONSE_DEADLINE_DAYS === 3 ? "tiga" : RESPONSE_DEADLINE_DAYS}) hari kerja sejak surat ini diterima.`,
  ];
  if (event.level === 2) {
    paragraphs.push(
      `Kami ingatkan bahwa apabila Saudara/i tidak memberikan keterangan dan tidak hadir bekerja hingga tercatat 5 (lima) hari kerja berturut-turut tanpa keterangan resmi, maka sesuai dengan Pasal 168 Undang-Undang Ketenagakerjaan, perusahaan berhak menganggap Saudara/i mengundurkan diri.`,
    );
  }
  paragraphs.push("Demikian surat panggilan ini kami sampaikan untuk dilaksanakan sebagaimana mestinya.");
  return paragraphs;
}

/** Plain-text version for the wa.me pre-filled message — WhatsApp's own *bold* / _italic_ markdown. */
export function buildMangkirLetterWhatsAppText(event: MangkirEvent): string {
  const dateList = event.triggerDates.map((d) => `- ${formatDateDMY(d)}`).join("\n");
  const lines = [
    `*${COMPANY_NAME}*`,
    `*${levelTitle(event.level)}*`,
    "",
    `Kepada Yth. *${event.name}*`,
    `NIK: ${event.nik}`,
    `Jabatan: ${event.position || "-"}`,
    `Departemen: ${event.department || "-"}`,
    "",
    `Sehubungan dengan tercatatnya ketidakhadiran Saudara/i tanpa keterangan (Mangkir) pada tanggal:`,
    dateList,
    "",
    `Mohon segera melapor dan memberikan keterangan kepada pihak HRD/Personalia selambat-lambatnya dalam waktu ${RESPONSE_DEADLINE_DAYS} hari kerja sejak pesan ini diterima.`,
  ];
  if (event.level === 2) {
    lines.push(
      "",
      "*Perhatian:* apabila ketidakhadiran berlanjut hingga 5 hari kerja berturut-turut tanpa keterangan resmi, sesuai Pasal 168 UU Ketenagakerjaan perusahaan berhak menganggap Saudara/i mengundurkan diri.",
    );
  }
  lines.push("", `Hormat kami,`, `HRD ${COMPANY_NAME}`);
  return lines.join("\n");
}

/** Indonesian phone numbers are usually stored starting with 0 — wa.me needs the 62 country code, no leading zero/plus/spaces/dashes. */
export function toWhatsAppNumber(rawPhone: string): string | null {
  const digits = rawPhone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppLink(event: MangkirEvent): string | null {
  const number = toWhatsAppNumber(event.phoneNumber);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(buildMangkirLetterWhatsAppText(event))}`;
}

/** Formal A4 letter, for HR's printed/filed copy — same PDFKit pattern as lib/ot-planning-export.ts's buildOtPlanningPdf. */
export async function buildMangkirLetterPdf(event: MangkirEvent): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const pageWidth = document.page.width - 56 * 2;
  const today = new Date().toISOString().slice(0, 10);

  document.font("Helvetica-Bold").fontSize(14).text(COMPANY_NAME, { align: "center" });
  document.moveDown(0.3);
  document.font("Helvetica-Bold").fontSize(12).text(levelTitle(event.level).toUpperCase(), { align: "center" });
  document.moveDown(1.2);
  document.moveTo(56, document.y).lineTo(56 + pageWidth, document.y).stroke();
  document.moveDown(1);

  document.font("Helvetica").fontSize(10);
  document.text(`Tanggal: ${formatDateDMY(today)}`);
  document.moveDown(0.8);
  document.text("Kepada Yth.");
  document.font("Helvetica-Bold").text(event.name);
  document.font("Helvetica").text(`NIK: ${event.nik}`);
  document.text(`Jabatan: ${event.position || "-"}`);
  document.text(`Departemen: ${event.department || "-"}`);
  document.moveDown(1);

  document.text("Dengan hormat,");
  document.moveDown(0.6);

  for (const paragraph of bodyParagraphs(event)) {
    document.text(paragraph, { align: "justify", width: pageWidth });
    document.moveDown(0.6);
  }

  document.moveDown(1.5);
  document.text("Hormat kami,");
  document.moveDown(2.5);
  document.font("Helvetica-Bold").text(`HRD ${COMPANY_NAME}`);

  document.end();
  return result;
}
