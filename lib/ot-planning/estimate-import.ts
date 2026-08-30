import type ExcelJS from "exceljs";

import { parseDateCell } from "@/lib/attendance/importer";

/**
 * Parser murni (tanpa DB) untuk sheet "estimasi OT Planning" yang HR upload
 * berbarengan dengan file absensi — biasanya "Sheet2". Bentuknya grid:
 *
 *   No | Departement/Unit | Date | 0,5 JAM | 1 JAM | 1,5 JAM | ... | 10 JAM
 *   NO | DEPARTEMEN SHED A | 28/08/2026 | ...
 *    1 | CUTTING           | 28/08/2026 | ...
 *    2 | SEW L1            | 28/08/2026 |  2 |    |    |  4 | ...
 *
 * - Baris "DEPARTEMEN SHED A/B/C" / "DEPARTEMEN COMMON" menetapkan shed aktif.
 * - Setiap sel angka > 0 di kolom durasi jadi satu baris estimasi.
 * - Tanggal diambil dari kolom "Date" pada baris itu (per baris, boleh beda).
 * - Unit yang tidak dikenal di ot_planning_divisions dilewati + dilaporkan.
 *
 * Hasil parsing dipetakan ke tabel ot_planning_estimates
 * (tanggal, shed, division, duration, person) oleh pemanggil.
 */

export interface OtEstimateRow {
  tanggal: string; // ISO yyyy-mm-dd
  shed: string;
  division: string;
  duration: number;
  person: number;
}

export interface OtEstimateSkippedRow {
  rowNumber: number;
  shed: string;
  unit: string;
  reason: string;
}

export interface ParsedOtEstimateImport {
  /** true kalau ada sheet berpola grid estimasi (punya kolom Departement/Unit + minimal 3 kolom "… JAM"). */
  detected: boolean;
  /** Diisi kalau estimasi TIDAK bisa diimpor (sheet tidak ada, kolom Date hilang, dst). */
  reason?: string;
  rows: OtEstimateRow[];
  skipped: OtEstimateSkippedRow[];
  /** Tanggal-tanggal unik (ISO) yang muncul di sheet, urut menaik. */
  dates: string[];
  totalPeople: number;
}

const JAM_RE = /^\s*(\d+(?:[.,]\d+)?)\s*JAM\s*$/i;
const SECTION_RE = /^\s*DEPARTEMEN\s+(SHED\s+[A-Z]|COMMON)\b/i;
const HEADER_SCAN_MAX_ROWS = 10;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const rich = value as Record<string, unknown>;
    if ("text" in rich) return String(rich.text ?? "").trim();
    if ("result" in rich) return String(rich.result ?? "").trim();
    if ("richText" in rich && Array.isArray(rich.richText)) return rich.richText.map((r: { text?: string }) => r.text ?? "").join("").trim();
  }
  return String(value).trim();
}

/** "4" / "4,5" / 4.5 -> number. Kosong / bukan angka -> null. */
function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = cellText(value);
  if (!str) return null;
  const normalized = str.includes(",") && !str.includes(".") ? str.replace(",", ".") : str;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeShed(sectionLabel: string): string {
  const match = sectionLabel.match(SECTION_RE);
  if (!match) return "";
  return match[1].toUpperCase().replace(/\s+/g, " ").trim();
}

/** Header row = a row with a "Departement/Unit"-ish cell and >= 3 "… JAM" cells. */
function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; unitCol: number; dateCol: number | null; durationByCol: Map<number, number> } | null {
  const maxRow = Math.min(HEADER_SCAN_MAX_ROWS, sheet.rowCount);
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    let unitCol = 0;
    let dateCol: number | null = null;
    const durationByCol = new Map<number, number>();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const label = cellText(cell.value);
      const lower = label.toLowerCase();
      if (!unitCol && /depart/.test(lower) && /unit/.test(lower)) unitCol = colNumber;
      else if (dateCol === null && (lower === "date" || lower === "tanggal")) dateCol = colNumber;
      const jam = label.match(JAM_RE);
      if (jam) durationByCol.set(colNumber, Number(jam[1].replace(",", ".")));
    });
    if (unitCol && durationByCol.size >= 3) return { rowNumber, unitCol, dateCol, durationByCol };
  }
  return null;
}

export function parseOtEstimateSheet(
  workbook: ExcelJS.Workbook,
  attendanceSheetName: string,
  knownDivisions: { shed: string; division: string }[],
): ParsedOtEstimateImport {
  const empty: ParsedOtEstimateImport = { detected: false, rows: [], skipped: [], dates: [], totalPeople: 0 };

  let target: { sheet: ExcelJS.Worksheet; header: NonNullable<ReturnType<typeof findHeaderRow>> } | null = null;
  for (const sheet of workbook.worksheets) {
    if (sheet.name === attendanceSheetName) continue;
    const header = findHeaderRow(sheet);
    if (header) { target = { sheet, header }; break; }
  }

  if (!target) {
    return { ...empty, reason: "Sheet estimasi OT (kolom Departement/Unit + Date + … JAM) tidak ditemukan di file." };
  }

  const { sheet, header } = target;
  if (header.dateCol === null) {
    return { ...empty, detected: true, reason: "Kolom \"Date\" tidak ada di sheet estimasi OT — estimasi tidak diimpor." };
  }

  const divisionByShed = new Map<string, Map<string, string>>();
  for (const d of knownDivisions) {
    const shedKey = d.shed.toUpperCase().trim();
    const map = divisionByShed.get(shedKey) ?? new Map<string, string>();
    map.set(d.division.toUpperCase().trim(), d.division);
    divisionByShed.set(shedKey, map);
  }

  const rows: OtEstimateRow[] = [];
  const skipped: OtEstimateSkippedRow[] = [];
  const dateSet = new Set<string>();
  let currentShed = "";

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= header.rowNumber) return;
    const unitRaw = cellText(row.getCell(header.unitCol).value);
    if (!unitRaw) return;

    if (SECTION_RE.test(unitRaw)) {
      currentShed = normalizeShed(unitRaw);
      return;
    }
    if (!currentShed) return;

    const cellsWithValue = Array.from(header.durationByCol.entries())
      .map(([col, duration]) => ({ duration, person: cellNumber(row.getCell(col).value) }))
      .filter((x) => x.person !== null && x.person > 0) as { duration: number; person: number }[];

    const division = divisionByShed.get(currentShed.toUpperCase())?.get(unitRaw.toUpperCase().trim());
    if (!division) {
      if (cellsWithValue.length) skipped.push({ rowNumber, shed: currentShed, unit: unitRaw, reason: "unit tidak dikenal di OT Planning" });
      return;
    }

    const tanggal = header.dateCol === null ? null : parseDateCell(row.getCell(header.dateCol).value);
    if (!tanggal) {
      if (cellsWithValue.length) skipped.push({ rowNumber, shed: currentShed, unit: unitRaw, reason: "kolom Date kosong / tidak valid" });
      return;
    }

    for (const { duration, person } of cellsWithValue) {
      rows.push({ tanggal, shed: currentShed, division, duration, person });
      dateSet.add(tanggal);
    }
  });

  return {
    detected: true,
    rows,
    skipped,
    dates: Array.from(dateSet).sort(),
    totalPeople: rows.reduce((sum, r) => sum + r.person, 0),
  };
}
