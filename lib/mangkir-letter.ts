// @ts-expect-error pdfkit does not ship a declaration for its standalone entry.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import type { MangkirEvent, MangkirSignerInfo } from "@/lib/mangkir-service";

/**
 * Surat Panggilan (warning letter) content — modeled directly on the
 * company's real letter templates (Surat Panggilan 1.doc / SP2.doc), not a
 * generic design. Shared source of truth for both the formal PDF (HR's
 * printed/filed copy) and the WhatsApp text message (sent directly to the
 * employee via a wa.me link — plain text only, so it's a notification of the
 * same content rather than the filed document itself).
 */

const MEETING_TIME = "11.00 WIB";
const MEETING_PLACE = "Ruang HRD PT MOD INDO";
const ISSUE_PLACE = "Kab. Semarang";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-07-13" -> "13 Juli 2026" — matches the real templates' date style throughout. */
function formatDateLongID(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS_ID[Number(mo) - 1]} ${y}`;
}

function addDaysISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

interface LetterContent {
  title: string;
  perihal: string;
  unitLine: string;
  bodyParagraph: string;
  meetingDate: string;
  closingParagraphs: string[];
  issuePlaceDate: string;
}

function buildLetterContent(event: MangkirEvent): LetterContent {
  const first = formatDateLongID(event.triggerDates[0]);
  const last = event.triggerDates[event.triggerDates.length - 1];
  const lastFormatted = formatDateLongID(last);
  const dayCount = event.triggerDates.length;
  const unitLine = [event.division, event.shed].filter(Boolean).join(" ");

  if (event.level === 1) {
    return {
      title: "SURAT PANGGILAN",
      perihal: "SURAT PANGGILAN 1",
      unitLine,
      bodyParagraph: `Sehubungan dengan ketidak hadiran saudara dari tanggal ${first} s/d ${lastFormatted} selama ${dayCount} hari tanpa keterangan yang dapat di pertanggung jawabkan, maka bersama ini kami harapkan Saudara bisa hadir pada`,
      meetingDate: formatDateLongID(addDaysISO(last, 1)),
      closingParagraphs: [
        "Bersama surat ini kami sampaikan Surat Panggilan Ke-1 kepada Saudara/i untuk segera melapor dan memberikan keterangan kepada pihak HRD/Personalia.",
        "Demikian surat panggilan ini kami sampaikan untuk dilaksanakan sebagaimana mestinya.",
      ],
      issuePlaceDate: `${ISSUE_PLACE}, ${lastFormatted}`,
    };
  }

  const sp1SentDate = event.previousLevelSentAt ? formatDateLongID(event.previousLevelSentAt.slice(0, 10)) : "(belum tercatat)";
  return {
    title: "SURAT PANGGILAN KE-2",
    perihal: "SURAT PANGGILAN II",
    unitLine,
    bodyParagraph: `Sehubungan dengan ketidak hadiran saudara dari tanggal ${first} s/d ${lastFormatted} selama ${dayCount} hari tanpa keterangan yang dapat di pertanggung jawabkan dan telah kami kirimkan surat panggilan kerja I (satu) pada tanggal ${sp1SentDate}, maka bersama ini kami sampaikan Surat panggilan Ke II (dua) untuk Saudara bisa hadir pada :`,
    meetingDate: formatDateLongID(addDaysISO(last, 1)),
    closingParagraphs: [
      "Apabila Saudara tidak memenuhi Surat Panggilan II (Kedua) ini tanpa memberikan alasan yang dapat dipertanggung jawabkan, maka perusahaan akan mengambil tindakan sesuai dengan ketentuan dan peraturan perusahaan yang berlaku.",
      "Ketidakhadiran Saudara dalam memenuhi panggilan tersebut akan kami catat sebagai ketidakpatuhan terhadap proses penyelesaian hubungan kerja secara prosedural dan dapat ditindaklanjuti sesuai dengan ketentuan yang berlaku.",
    ],
    issuePlaceDate: `${ISSUE_PLACE}, ${lastFormatted}`,
  };
}

/** Plain-text version for the wa.me pre-filled message — WhatsApp's own *bold* markdown. */
export function buildMangkirLetterWhatsAppText(event: MangkirEvent, signer: MangkirSignerInfo): string {
  const c = buildLetterContent(event);
  const lines = [
    `*${c.title}*`,
    event.letterNumber ? `No. ${event.letterNumber}` : "",
    "",
    `Kepada Yth,`,
    `Sdr/sdri: *${event.name}*`,
    `(${c.unitLine})`,
    event.address || "",
    event.phoneNumber ? `(${event.phoneNumber})` : "",
    "Ditempat",
    "",
    `Perihal: ${c.perihal}`,
    "",
    "Dengan hormat,",
    "",
    c.bodyParagraph,
    "",
    `Tanggal : ${c.meetingDate}`,
    `Jam        : ${MEETING_TIME}`,
    `Tempat   : ${MEETING_PLACE}`,
    "",
    ...c.closingParagraphs,
    "",
    "Atas Perhatian dan kerjasamanya kami sampaikan terima kasih.",
    "",
    c.issuePlaceDate,
    "Hormat kami,",
    "",
    `*${signer.signerName}*`,
    signer.signerTitle,
  ];
  return lines.filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Indonesian phone numbers are usually stored starting with 0 — wa.me needs the 62 country code, no leading zero/plus/spaces/dashes. */
export function toWhatsAppNumber(rawPhone: string): string | null {
  const digits = rawPhone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppLink(event: MangkirEvent, signer: MangkirSignerInfo): string | null {
  const number = toWhatsAppNumber(event.phoneNumber);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(buildMangkirLetterWhatsAppText(event, signer))}`;
}

/** Formal A4 letter, for HR's printed/filed copy — same PDFKit pattern as lib/ot-planning-export.ts's buildOtPlanningPdf. */
export async function buildMangkirLetterPdf(event: MangkirEvent, signer: MangkirSignerInfo): Promise<Buffer> {
  const c = buildLetterContent(event);
  const document = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const pageWidth = document.page.width - 56 * 2;

  document.font("Helvetica-Bold").fontSize(14).text(c.title, { align: "center" });
  if (event.letterNumber) {
    document.font("Helvetica").fontSize(10).text(`No. ${event.letterNumber}`, { align: "center" });
  }
  document.moveDown(1.2);

  document.font("Helvetica").fontSize(10);
  document.text("Kepada Yth,");
  document.text(`Sdr/sdri: `, { continued: true }).font("Helvetica-Bold").text(event.name);
  document.font("Helvetica").text(`(${c.unitLine})`);
  if (event.address) document.text(event.address);
  if (event.phoneNumber) document.text(`(${event.phoneNumber})`);
  document.text("Ditempat");
  document.moveDown(0.8);

  document.text(`Perihal     : ${c.perihal}`);
  document.moveDown(0.8);

  document.text("Dengan hormat,");
  document.moveDown(0.4);
  document.text(c.bodyParagraph, { align: "justify", width: pageWidth });
  document.moveDown(0.8);

  document.text(`Tanggal    : ${c.meetingDate}`);
  document.text(`Jam        : ${MEETING_TIME}`);
  document.text(`Tempat     : ${MEETING_PLACE}`);
  document.moveDown(0.8);

  for (const paragraph of c.closingParagraphs) {
    document.text(paragraph, { align: "justify", width: pageWidth });
    document.moveDown(0.6);
  }
  document.text("Atas Perhatian dan kerjasamanya kami sampaikan terima kasih.");
  document.moveDown(1.2);

  document.text(c.issuePlaceDate);
  document.text("Hormat kami,");
  document.moveDown(2.5);
  document.font("Helvetica-Bold").text(signer.signerName);
  document.text(signer.signerTitle);

  document.end();
  return result;
}
