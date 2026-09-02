import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

import type { MangkirEvent, MangkirSignerInfo } from "@/lib/mangkir-service";
import { MANGKIR_LETTERHEAD_PDF_BASE64 } from "@/lib/mangkir-letterhead-data";

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
  /** SP2's two closing paragraphs run on with no blank line between them — only SP1's (unrelated) pair keeps one. */
  joinClosingParagraphs?: boolean;
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
      "Ketidak hadiran Saudara dalam memenuhi panggilan tersebut akan kami catat sebagai ketidak patuhan terhadap proses penyelesaian hubungan kerja secara prosedural dan dapat ditindaklanjuti sesuai dengan ketentuan yang berlaku.",
    ],
    joinClosingParagraphs: true,
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
    "di Tempat",
    "",
    `Perihal: ${c.perihal}`,
    "",
    "Dengan hormat,",
    c.bodyParagraph,
    "",
    `Tanggal : ${c.meetingDate}`,
    `Jam        : ${MEETING_TIME}`,
    `Tempat   : ${MEETING_PLACE}`,
    "",
    c.joinClosingParagraphs ? c.closingParagraphs.join(" ") : c.closingParagraphs.join("\n\n"),
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

// Content area on the PT MOD INDO letterhead (assets/mangkir-letterhead.pdf,
// embedded as base64 in mangkir-letterhead-data.ts) — clears the logo/title
// band at the top and the office-address footer band at the bottom. pdf-lib
// coordinates are bottom-left origin, unlike PDFKit's top-left.
const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 56;
const MARGIN_TOP = 135; // below the logo + "PT. MOD INDO" + rule
const MARGIN_BOTTOM = 78; // above the "Head Office & Factory" footer block
const FONT_SIZE = 10.5;
const LINE_HEIGHT = FONT_SIZE * 1.15; // "paragraf jadi 1.15"
const LABEL_COLUMN_WIDTH = 62; // aligns the ":" in Perihal/Tanggal/Jam/Tempat

/** Greedy word-wrap using the font's actual glyph widths — pdf-lib has no built-in text flow. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Formal A4 letter on the real PT MOD INDO letterhead, for HR's printed/filed copy. */
export async function buildMangkirLetterPdf(event: MangkirEvent, signer: MangkirSignerInfo): Promise<Buffer> {
  const c = buildLetterContent(event);
  const letterheadBytes = Buffer.from(MANGKIR_LETTERHEAD_PDF_BASE64, "base64");
  const doc = await PDFDocument.load(letterheadBytes);
  // A second, never-drawn-on instance purely as a pristine source for extra
  // pages — copying from `doc`'s own page 0 after content is already drawn
  // on it would duplicate that content onto the new page too.
  const templateSource = await PDFDocument.load(letterheadBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.getPage(0);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const contentWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  let y = pageHeight - MARGIN_TOP;

  // Starts a fresh letterhead page (copied from the template) when content
  // would otherwise run into the footer — a Surat Panggilan is short enough
  // that this is a rare safety net, not the common case.
  async function ensureSpace(linesNeeded: number) {
    if (y - linesNeeded * LINE_HEIGHT >= MARGIN_BOTTOM) return;
    const [fresh] = await doc.copyPages(templateSource, [0]);
    page = doc.addPage(fresh);
    y = pageHeight - MARGIN_TOP;
  }

  async function line(text: string, opts: { bold?: boolean; size?: number; center?: boolean; x?: number } = {}) {
    await ensureSpace(1);
    const useFont = opts.bold ? boldFont : font;
    const size = opts.size ?? FONT_SIZE;
    const x = opts.center ? MARGIN_LEFT + (contentWidth - useFont.widthOfTextAtSize(text, size)) / 2 : (opts.x ?? MARGIN_LEFT);
    page.drawText(text, { x, y, size, font: useFont });
    y -= LINE_HEIGHT;
  }

  async function paragraph(text: string) {
    for (const wrapped of wrapText(text, font, FONT_SIZE, contentWidth)) await line(wrapped);
  }

  async function blank(count = 1) {
    for (let i = 0; i < count; i++) {
      await ensureSpace(1);
      y -= LINE_HEIGHT;
    }
  }

  /** "Sdr/sdri: " in regular weight immediately followed by the bold name, on one line. */
  async function labelPlusBold(label: string, bold: string) {
    await ensureSpace(1);
    page.drawText(label, { x: MARGIN_LEFT, y, size: FONT_SIZE, font });
    const boldX = MARGIN_LEFT + font.widthOfTextAtSize(label, FONT_SIZE);
    page.drawText(bold, { x: boldX, y, size: FONT_SIZE, font: boldFont });
    y -= LINE_HEIGHT;
  }

  /** "Label     : value" with the colon fixed at the same column every time it's called. */
  async function labeledRow(label: string, value: string) {
    await ensureSpace(1);
    page.drawText(label, { x: MARGIN_LEFT, y, size: FONT_SIZE, font });
    page.drawText(`: ${value}`, { x: MARGIN_LEFT + LABEL_COLUMN_WIDTH, y, size: FONT_SIZE, font });
    y -= LINE_HEIGHT;
  }

  await line(c.title, { bold: true, size: 14, center: true });
  if (event.letterNumber) await line(`No. ${event.letterNumber}`, { center: true });
  await blank();

  await line("Kepada Yth,");
  await labelPlusBold("Sdr/sdri: ", event.name);
  await line(`(${c.unitLine})`);
  if (event.address) await line(event.address);
  if (event.phoneNumber) await line(`(${event.phoneNumber})`);
  await line("di Tempat");
  await blank(); // "setelah di tempat kemudian enter"

  await labeledRow("Perihal", c.perihal);
  await blank(); // "setelah perihal di enter"

  await line("Dengan hormat,");
  await paragraph(c.bodyParagraph); // no blank between "Dengan hormat," and the body
  await blank();

  await labeledRow("Tanggal", c.meetingDate);
  await labeledRow("Jam", MEETING_TIME);
  await labeledRow("Tempat", MEETING_PLACE);
  await blank();

  if (c.joinClosingParagraphs) {
    // Runs on as one paragraph — no blank line between the two sentences.
    await paragraph(c.closingParagraphs.join(" "));
    await blank();
  } else {
    for (const p of c.closingParagraphs) {
      await paragraph(p);
      await blank();
    }
  }
  await line("Atas Perhatian dan kerjasamanya kami sampaikan terima kasih.");
  await blank(2); // "setelah terimakasih di enter 2x"

  await line(c.issuePlaceDate);
  await line("Hormat kami,");
  await blank(2); // room for an actual signature
  await line(signer.signerName, { bold: true });
  await line(signer.signerTitle);

  return Buffer.from(await doc.save());
}
