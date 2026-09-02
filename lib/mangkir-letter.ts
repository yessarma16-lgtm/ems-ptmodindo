import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

import type { MangkirEvent, MangkirSignerInfo } from "@/lib/mangkir-service";
import { MANGKIR_LETTERHEAD_PDF_BASE64 } from "@/lib/mangkir-letterhead-data";
import { MANGKIR_SIGNATURE_PNG_BASE64 } from "@/lib/mangkir-signature-data";

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

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/**
 * Full letter number string, e.g. "5/HRD_SPK/VIII/2026" — HR only ever types
 * the leading sequence number (`sequence`, `event.letterNumber` as stored);
 * the "/HRD_SPK/{bulan romawi}/{tahun}" part is always derived from the
 * letter's own issue date (the episode's last absence date), never typed.
 */
export function buildFullLetterNumber(sequence: string, issueDateIso: string): string {
  if (!sequence.trim()) return "";
  const m = /^(\d{4})-(\d{2})/.exec(issueDateIso);
  if (!m) return sequence;
  const [, year, month] = m;
  return `${sequence.trim()}/HRD_SPK/${ROMAN_MONTHS[Number(month) - 1]}/${year}`;
}

interface LetterContent {
  title: string;
  perihal: string;
  unitLine: string;
  bodyParagraph: string;
  meetingDate: string;
  closingParagraphs: string[];
  issuePlaceDate: string;
  fullLetterNumber: string;
}

function buildLetterContent(event: MangkirEvent): LetterContent {
  const first = formatDateLongID(event.triggerDates[0]);
  const last = event.triggerDates[event.triggerDates.length - 1];
  const lastFormatted = formatDateLongID(last);
  const dayCount = event.triggerDates.length;
  const unitLine = [event.division, event.shed].filter(Boolean).join(" ");
  const fullLetterNumber = buildFullLetterNumber(event.letterNumber, last);

  if (event.level === 1) {
    return {
      title: "SURAT PANGGILAN",
      perihal: "Surat Panggilan ke-1",
      unitLine,
      bodyParagraph: `Sehubungan dengan ketidak hadiran saudara dari tanggal ${first} s/d ${lastFormatted} selama ${dayCount} hari tanpa keterangan yang dapat di pertanggung jawabkan, maka bersama ini kami harapkan Saudara bisa hadir pada`,
      meetingDate: formatDateLongID(addDaysISO(last, 1)),
      closingParagraphs: [
        "Bersama surat ini kami sampaikan Surat Panggilan Ke-1 kepada Saudara/i untuk segera melapor dan memberikan keterangan kepada pihak HRD/Personalia.",
        "Demikian surat panggilan ini kami sampaikan untuk dilaksanakan sebagaimana mestinya.",
      ],
      issuePlaceDate: `${ISSUE_PLACE}, ${lastFormatted}`,
      fullLetterNumber,
    };
  }

  const sp1SentDate = event.previousLevelSentAt ? formatDateLongID(event.previousLevelSentAt.slice(0, 10)) : "(belum tercatat)";
  return {
    title: "SURAT PANGGILAN KE-2",
    perihal: "Surat Panggilan ke-2",
    unitLine,
    bodyParagraph: `Sehubungan dengan ketidak hadiran saudara dari tanggal ${first} s/d ${lastFormatted} selama ${dayCount} hari tanpa keterangan dan telah kami kirimkan surat panggilan ke-1 (satu) pada tanggal ${sp1SentDate}, maka bersama ini kami sampaikan Surat panggilan Ke-2 (dua) untuk Saudara bisa hadir pada :`,
    meetingDate: formatDateLongID(addDaysISO(last, 1)),
    closingParagraphs: [
      "Apabila Saudara tidak memenuhi Surat Panggilan ke-2 (dua) ini tanpa memberikan alasan yang dapat dipertanggung jawabkan, maka perusahaan akan mengambil tindakan sesuai dengan ketentuan dan peraturan perusahaan yang berlaku.",
      "Ketidak hadiran Saudara dalam memenuhi panggilan tersebut akan kami catat sebagai ketidak patuhan terhadap proses penyelesaian hubungan kerja secara prosedural dan dapat ditindak lanjuti sesuai dengan ketentuan yang berlaku.",
    ],
    issuePlaceDate: `${ISSUE_PLACE}, ${lastFormatted}`,
    fullLetterNumber,
  };
}

/**
 * Plain-text version for the wa.me pre-filled message — WhatsApp's own *bold*
 * markdown. Line breaks mirror the formal PDF's layout (blank line between
 * every block) so the message reads as tidily as the printed letter; empty
 * optional fields (letter number, address, phone) are skipped without leaving
 * a stray blank line.
 */
export function buildMangkirLetterWhatsAppText(event: MangkirEvent, signer: MangkirSignerInfo): string {
  const c = buildLetterContent(event);
  const L: string[] = [];

  L.push(`*${c.title}*`);
  if (c.fullLetterNumber) L.push(`No. ${c.fullLetterNumber}`);
  L.push("");
  L.push("Kepada Yth,");
  L.push(`Sdr/sdri: *${event.name}*`);
  L.push(`(${c.unitLine})`);
  if (event.address) L.push(event.address);
  if (event.phoneNumber) L.push(`(${event.phoneNumber})`);
  L.push("di Tempat");
  L.push("");
  L.push(`Perihal: ${c.perihal}`);
  L.push("");
  L.push("Dengan hormat,");
  L.push(c.bodyParagraph);
  L.push("");
  L.push(`Tanggal : ${c.meetingDate}`);
  L.push(`Jam     : ${MEETING_TIME}`);
  L.push(`Tempat  : ${MEETING_PLACE}`);
  L.push("");
  for (const p of c.closingParagraphs) {
    L.push(p);
    L.push("");
  }
  L.push("Atas Perhatian dan kerjasamanya kami sampaikan terima kasih.");
  L.push("");
  L.push(c.issuePlaceDate);
  L.push("Hormat kami,");
  L.push("");
  L.push(`*${signer.signerName}*`);
  L.push(signer.signerTitle);

  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Indonesian phone numbers are usually stored starting with 0 — WhatsApp needs the 62 country code, no leading zero/plus/spaces/dashes. */
export function toWhatsAppNumber(rawPhone: string): string | null {
  const digits = rawPhone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

/**
 * Opens the chat straight in WhatsApp Web (web.whatsapp.com/send), not the
 * wa.me interstitial. wa.me bounces through its own landing page which — on a
 * desktop browser — keeps trying to hand off to the app / a fresh login tab;
 * web.whatsapp.com/send drops the user directly into the pre-filled chat in
 * the WhatsApp Web session they already have open. HR uses WhatsApp Web.
 */
export function buildWhatsAppLink(event: MangkirEvent, signer: MangkirSignerInfo): string | null {
  const number = toWhatsAppNumber(event.phoneNumber);
  if (!number) return null;
  const text = encodeURIComponent(buildMangkirLetterWhatsAppText(event, signer));
  return `https://web.whatsapp.com/send?phone=${number}&text=${text}&type=phone_number&app_absent=0`;
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
const LINE_HEIGHT = FONT_SIZE * 1.25; // "paragraf jadi 1.25"
const LABEL_COLUMN_WIDTH = 62; // aligns the ":" in Perihal/Tanggal/Jam/Tempat

/** Greedy word-wrap using the font's actual glyph widths — pdf-lib has no built-in text flow. Returns each line as its still-separate words, so the caller can justify them. */
function wrapTextWords(text: string, font: PDFFont, size: number, maxWidth: number): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    const candidate = [...current, word].join(" ");
    if (current.length && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current);
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
  const signatureImage = await doc.embedPng(Buffer.from(MANGKIR_SIGNATURE_PNG_BASE64, "base64"));
  const SIGNATURE_WIDTH = 110;
  const SIGNATURE_HEIGHT = SIGNATURE_WIDTH * (signatureImage.height / signatureImage.width);

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

  /** Justified (rata kanan-kiri): extra space is spread between words so a wrapped line's words touch both margins. The paragraph's last line (or any one-word line) stays left-aligned, per normal typographic convention. */
  async function paragraph(text: string) {
    const lines = wrapTextWords(text, font, FONT_SIZE, contentWidth);
    for (let i = 0; i < lines.length; i++) {
      const words = lines[i];
      await ensureSpace(1);
      const isLastLine = i === lines.length - 1;
      if (isLastLine || words.length === 1) {
        page.drawText(words.join(" "), { x: MARGIN_LEFT, y, size: FONT_SIZE, font });
      } else {
        const wordsWidth = words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, FONT_SIZE), 0);
        const gapWidth = (contentWidth - wordsWidth) / (words.length - 1);
        let x = MARGIN_LEFT;
        for (const word of words) {
          page.drawText(word, { x, y, size: FONT_SIZE, font });
          x += font.widthOfTextAtSize(word, FONT_SIZE) + gapWidth;
        }
      }
      y -= LINE_HEIGHT;
    }
  }

  async function blank(count = 1) {
    for (let i = 0; i < count; i++) {
      await ensureSpace(1);
      y -= LINE_HEIGHT;
    }
  }

  /** HRD's scanned signature, drawn between "Hormat kami," and the printed signer name/title. */
  async function drawSignature() {
    await ensureSpace(Math.ceil(SIGNATURE_HEIGHT / LINE_HEIGHT) + 1);
    page.drawImage(signatureImage, { x: MARGIN_LEFT, y: y - SIGNATURE_HEIGHT, width: SIGNATURE_WIDTH, height: SIGNATURE_HEIGHT });
    y -= SIGNATURE_HEIGHT + LINE_HEIGHT * 0.3;
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
  if (c.fullLetterNumber) await line(`No. ${c.fullLetterNumber}`, { center: true });
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

  for (const p of c.closingParagraphs) {
    await paragraph(p);
    await blank();
  }
  await line("Atas Perhatian dan kerjasamanya kami sampaikan terima kasih.");
  await blank(2); // "setelah terimakasih di enter 2x"

  await line(c.issuePlaceDate);
  await line("Hormat kami,");
  await drawSignature();
  await line(signer.signerName, { bold: true });
  await line(signer.signerTitle);

  return Buffer.from(await doc.save());
}
