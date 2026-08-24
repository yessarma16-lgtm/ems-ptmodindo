import ExcelJS from "exceljs";

import { normalizeExcelBuffer } from "@/lib/excel-import";

/**
 * Parsing & validasi murni file Excel absensi menjadi baris `raw_attendance`
 * — TIDAK menyentuh database (bulk-insert + resolusi konflik (nik, tanggal)
 * adalah tanggung jawab `lib/attendance-import.ts`, langkah berikutnya
 * setelah adapter (langkah 4) selesai). Dipisah supaya bisa ditest tanpa DB,
 * mirror alasan yang sama dengan kenapa `overtime-rules.ts` menerima
 * `lookupBracket` sebagai parameter alih-alih mengimpor adapter langsung.
 *
 * Lihat docs/ATTENDANCE_OVERTIME_MODULE_SPEC.md bagian "Importer" untuk
 * requirement lengkapnya.
 */

/** Header kolom yang diimpor — case-insensitive & trim saat dicocokkan. Kolom lain (mis. "InTime (Jam)") diabaikan sepenuhnya, bukan error. */
export const WHITELIST_HEADERS = [
  "RowNo",
  "LastDeptname",
  "NIK",
  "Nama",
  "Date",
  "HK56",
  "InTime",
  "OutTime",
  "IT1",
  "OT1",
  "WHour",
  "BHour",
  "OTHour",
  "Description",
  "QuitDate",
] as const;

export type WhitelistHeader = (typeof WHITELIST_HEADERS)[number];

export interface RawAttendanceParsedRow {
  rowNumber: number; // 1-indexed nomor baris spreadsheet, termasuk header
  rowNo: string;
  lastDeptname: string;
  nik: string;
  nama: string;
  tanggal: string; // ISO yyyy-mm-dd
  hk56: string;
  intime: string | null; // 'HH:mm' atau null (hari libur/ijin boleh kosong)
  outtime: string | null;
  it1: string | null;
  ot1: string | null;
  whour: number | null;
  bhour: number | null;
  othour: number | null;
  kategori: string; // dari kolom Description
  quitDate: string;
}

export interface RawAttendanceRejectedRow {
  rowNumber: number;
  reason: string;
}

export interface ParsedAttendanceImport {
  headerRowNumber: number;
  rows: RawAttendanceParsedRow[];
  rejected: RawAttendanceRejectedRow[];
}

export class ImportParseError extends Error {}

const HEADER_SCAN_MAX_ROWS = 10;
/** Minimal jumlah kolom whitelist yang harus cocok di satu baris supaya baris itu dianggap header — mencegah baris data biasa salah dikira header. */
const MIN_HEADER_MATCHES = 5;

function normalizeHeaderLabel(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Scan beberapa baris pertama satu sheet untuk menemukan baris header —
 * tidak mengasumsikan header selalu di baris 1 atau 2, karena ada file nyata
 * dengan posisi header berbeda-beda. Return null (bukan throw) kalau sheet
 * ini tidak punya baris header yang cocok, supaya pemanggil bisa coba sheet
 * lain (lihat `selectSheetWithHeaderRow` — sebagian file punya sheet pivot
 * ringkasan sebelum sheet data asli).
 */
function scanHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; columnKeyByIndex: Map<number, WhitelistHeader> } | null {
  const whitelistByLabel = new Map<string, WhitelistHeader>(WHITELIST_HEADERS.map((h) => [h.toLowerCase(), h]));

  let best: { rowNumber: number; columnKeyByIndex: Map<number, WhitelistHeader> } | null = null;
  let bestMatches = 0;

  const maxRow = Math.min(HEADER_SCAN_MAX_ROWS, sheet.rowCount);
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const columnKeyByIndex = new Map<number, WhitelistHeader>();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const label = normalizeHeaderLabel(cell.value);
      const whitelisted = whitelistByLabel.get(label);
      if (whitelisted) columnKeyByIndex.set(colNumber, whitelisted);
    });
    if (columnKeyByIndex.size > bestMatches) {
      bestMatches = columnKeyByIndex.size;
      best = { rowNumber, columnKeyByIndex };
    }
  }

  return bestMatches >= MIN_HEADER_MATCHES ? best : null;
}

/**
 * Pilih sheet yang punya baris header paling cocok di antara semua sheet di
 * workbook — bukan cuma sheet pertama, karena beberapa file nyata menaruh
 * sheet pivot/ringkasan (mis. "Sheet2") sebelum sheet data absensi
 * sebenarnya.
 */
function selectSheetWithHeaderRow(workbook: ExcelJS.Workbook): { sheet: ExcelJS.Worksheet; rowNumber: number; columnKeyByIndex: Map<number, WhitelistHeader> } {
  let best: { sheet: ExcelJS.Worksheet; rowNumber: number; columnKeyByIndex: Map<number, WhitelistHeader> } | null = null;
  for (const sheet of workbook.worksheets) {
    const found = scanHeaderRow(sheet);
    if (found && (!best || found.columnKeyByIndex.size > best.columnKeyByIndex.size)) {
      best = { sheet, ...found };
    }
  }
  if (!best) {
    throw new ImportParseError(
      "Tidak ditemukan baris header yang cocok. Pastikan kolom NIK, Nama, Date, dst ada dan namanya sesuai.",
    );
  }
  return best;
}

/** "0,75" atau "2,5" -> 0.75 / 2.5 (koma sebagai desimal). Angka biasa & titik-desimal tetap didukung. */
function parseDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  if (!str) return null;
  const normalized = str.includes(",") && !str.includes(".") ? str.replace(",", ".") : str;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "DD/MM/YYYY" (teks) -> ISO yyyy-mm-dd. Parse manual, TIDAK pakai `new Date(string)` bawaan JS — itu rawan salah baca jadi MM/DD/YYYY tergantung locale environment. */
function parseDDMMYYYYText(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

/** Cell tanggal bisa berupa Date instance (serial Excel asli, sudah benar dari ExcelJS) atau teks "DD/MM/YYYY". */
function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) return parseDDMMYYYYText(value);
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Cell jam bisa: kosong (hari libur/ijin -> null), Date instance (serial
 * Excel time-of-day — dibaca pakai getUTC*, bukan getHours/getMinutes lokal,
 * karena ExcelJS mengonstruksi Date-nya dari epoch UTC 1899-12-30, sama
 * seperti excelSerialToISODate() di lib/employee-import.ts), angka desimal
 * fraksi hari (0.3125 = 07:30), atau teks "HH:mm" / "HH:mm:ss".
 */
function parseTimeCell(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
  }
  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${pad2(hours)}:${pad2(minutes)}`;
  }
  const str = String(value).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${pad2(Number(match[1]))}:${pad2(Number(match[2]))}`;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value && typeof value === "object" && "text" in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  if (value && typeof value === "object" && "result" in (value as Record<string, unknown>)) {
    return String((value as { result: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

export async function parseAttendanceImportWorkbook(buffer: Buffer): Promise<ParsedAttendanceImport> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(normalizeExcelBuffer(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new ImportParseError("This doesn't look like a valid .xls or .xlsx file.");
  }

  if (!workbook.worksheets.length) throw new ImportParseError("The uploaded file has no sheets.");

  const { sheet, rowNumber: headerRowNumber, columnKeyByIndex } = selectSheetWithHeaderRow(workbook);

  const rows: RawAttendanceParsedRow[] = [];
  const rejected: RawAttendanceRejectedRow[] = [];

  // `rowCount` can be inflated by Excel formatting/trailing empty rows up to
  // Excel's worksheet limit. `eachRow({ includeEmpty: false })` visits only
  // rows that actually contain values, avoiding an O(1M) scan for small files.
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber || row.values == null) return;

    const raw: Partial<Record<WhitelistHeader, unknown>> = {};
    columnKeyByIndex.forEach((key, colNumber) => {
      raw[key] = row.getCell(colNumber).value;
    });

    const hasAnyValue = Object.values(raw).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!hasAnyValue) return;

    const nik = cellToString(raw.NIK);
    const nama = cellToString(raw.Nama);
    const tanggal = parseDateCell(raw.Date);

    if (!nik || !nama || !tanggal) {
      const missing = [!nik && "NIK", !nama && "Nama", !tanggal && "Date"].filter(Boolean).join(", ");
      rejected.push({ rowNumber, reason: `Kolom wajib kosong/tidak valid: ${missing}` });
      return;
    }

    rows.push({
      rowNumber,
      rowNo: cellToString(raw.RowNo),
      lastDeptname: cellToString(raw.LastDeptname),
      nik,
      nama,
      tanggal,
      hk56: cellToString(raw.HK56),
      intime: parseTimeCell(raw.InTime),
      outtime: parseTimeCell(raw.OutTime),
      it1: parseTimeCell(raw.IT1),
      ot1: parseTimeCell(raw.OT1),
      whour: parseDecimal(raw.WHour),
      bhour: parseDecimal(raw.BHour),
      othour: parseDecimal(raw.OTHour),
      kategori: cellToString(raw.Description),
      quitDate: cellToString(raw.QuitDate),
    });
  });

  return { headerRowNumber, rows, rejected };
}
