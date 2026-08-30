import "server-only";

import { loadImportWorkbook, parseAttendanceFromWorkbook, ImportParseError, type RawAttendanceRejectedRow } from "@/lib/attendance/importer";
import { parseOtEstimateSheet, type OtEstimateRow, type OtEstimateSkippedRow } from "@/lib/ot-planning/estimate-import";
import { getAttendanceAdapter, type AttendanceDatabaseAdapter } from "@/lib/database/attendance-adapter";
import type { RawAttendanceInput, RawAttendanceRecord, ImportSummary } from "@/lib/database/attendance-types";

export { ImportParseError };

/**
 * Orkestrasi Tab 1 "Import Data Absensi": `importer.ts` (parsing murni,
 * tanpa DB) -> preview konflik lewat AttendanceDatabaseAdapter -> commit
 * setelah user memutuskan Timpa/Lewati per baris. TIDAK ada tulis ke DB
 * sebelum `commitAttendanceImport` dipanggil — `previewAttendanceImport`
 * murni baca (findExistingByNikDate + getRawAttendance untuk tampilan
 * nilai lama vs baru).
 */

export interface AttendanceImportPreviewRow {
  rowNumber: number;
  key: string; // `${nik}::${tanggal}`
  input: RawAttendanceInput;
}

export interface AttendanceConflictPreview {
  rowNumber: number;
  key: string;
  existing: RawAttendanceRecord;
  incoming: RawAttendanceInput;
}

/** Ringkasan hasil parsing Sheet2 (estimasi OT Planning) untuk layar preview. */
export interface OtEstimateImportPreview {
  detected: boolean;
  reason?: string;
  rows: OtEstimateRow[];
  skipped: OtEstimateSkippedRow[];
  dates: string[];
  totalPeople: number;
  /** Peringatan non-blok, mis. tanggal estimasi tidak cocok dengan tanggal absensi di file. */
  warnings: string[];
  summary: { units: number; cells: number; totalPeople: number };
}

export interface AttendanceImportPreview {
  sourceFilename: string;
  validRows: AttendanceImportPreviewRow[];
  conflicts: AttendanceConflictPreview[];
  rejected: RawAttendanceRejectedRow[];
  estimateImport: OtEstimateImportPreview;
}

export async function previewAttendanceImport(
  buffer: Buffer,
  sourceFilename: string,
  adapter: AttendanceDatabaseAdapter = getAttendanceAdapter(),
  otDivisions: { shed: string; division: string }[] = [],
): Promise<AttendanceImportPreview> {
  const workbook = await loadImportWorkbook(buffer);
  const parsed = parseAttendanceFromWorkbook(workbook);

  const estimateParsed = parseOtEstimateSheet(workbook, parsed.sheetName, otDivisions);
  const attendanceDates = new Set(parsed.rows.map((r) => r.tanggal));
  const warnings: string[] = [];
  if (estimateParsed.rows.length && estimateParsed.dates.length && !estimateParsed.dates.some((d) => attendanceDates.has(d))) {
    warnings.push(
      `Tanggal estimasi OT (${estimateParsed.dates.join(", ")}) tidak cocok dengan tanggal data absensi di file (${Array.from(attendanceDates).sort().join(", ") || "tidak ada"}).`,
    );
  }
  const estimateImport: OtEstimateImportPreview = {
    detected: estimateParsed.detected,
    reason: estimateParsed.reason,
    rows: estimateParsed.rows,
    skipped: estimateParsed.skipped,
    dates: estimateParsed.dates,
    totalPeople: estimateParsed.totalPeople,
    warnings,
    summary: {
      units: new Set(estimateParsed.rows.map((r) => `${r.shed}|${r.division}`)).size,
      cells: estimateParsed.rows.length,
      totalPeople: estimateParsed.totalPeople,
    },
  };

  const mapped: AttendanceImportPreviewRow[] = parsed.rows.map((r) => ({
    rowNumber: r.rowNumber,
    key: `${r.nik}::${r.tanggal}`,
    input: {
      nik: r.nik,
      nama: r.nama,
      department: r.lastDeptname,
      tanggal: r.tanggal,
      intime: r.intime,
      outtime: r.outtime,
      it1: r.it1,
      ot1: r.ot1,
      whour: r.whour,
      bhour: r.bhour,
      othourRecorded: r.othour,
      kategori: r.kategori,
      importedBy: "", // diisi ulang saat commit (imported_by baru pasti setelah tahu user yang login)
      sourceFilename,
    },
  }));

  if (mapped.length === 0) {
    return { sourceFilename, validRows: [], conflicts: [], rejected: parsed.rejected, estimateImport };
  }

  const existing = await adapter.findExistingByNikDate(mapped.map((m) => ({ nik: m.input.nik, date: m.input.tanggal })));
  if (existing.length === 0) {
    return { sourceFilename, validRows: mapped, conflicts: [], rejected: parsed.rejected, estimateImport };
  }

  const existingKeys = new Set(existing.map((e) => `${e.nik}::${e.tanggal}`));

  // Ambil full row lama (bukan cuma id/nik/tanggal dari findExistingByNikDate)
  // supaya UI bisa tampilkan nilai lama vs baru side-by-side. Per nik unik
  // yang konflik saja, bukan seluruh tabel.
  const niksWithConflict = Array.from(new Set(existing.map((e) => e.nik)));
  const existingRowsByKey = new Map<string, RawAttendanceRecord>();
  for (const nik of niksWithConflict) {
    const rows = await adapter.getRawAttendance({ nik });
    for (const row of rows) existingRowsByKey.set(`${row.nik}::${row.tanggal}`, row);
  }

  const validRows: AttendanceImportPreviewRow[] = [];
  const conflicts: AttendanceConflictPreview[] = [];
  for (const m of mapped) {
    if (!existingKeys.has(m.key)) {
      validRows.push(m);
      continue;
    }
    const existingRow = existingRowsByKey.get(m.key);
    if (!existingRow) {
      // Tidak seharusnya terjadi (findExistingByNikDate & getRawAttendance query tabel yang sama), tapi kalau ada race condition, perlakukan sebagai baris baru daripada gagal seluruh preview.
      validRows.push(m);
      continue;
    }
    conflicts.push({ rowNumber: m.rowNumber, key: m.key, existing: existingRow, incoming: m.input });
  }

  return { sourceFilename, validRows, conflicts, rejected: parsed.rejected, estimateImport };
}

/** `rows` tanpa importedBy/sourceFilename -- keduanya diketahui di sini (session user, nama file dari step preview), bukan dikirim balik oleh client. */
export type CommitRowInput = Omit<RawAttendanceInput, "importedBy" | "sourceFilename">;

export async function commitAttendanceImport(
  rows: CommitRowInput[],
  decisions: Record<string, "overwrite" | "skip">,
  importedBy: string,
  sourceFilename: string,
  adapter: AttendanceDatabaseAdapter = getAttendanceAdapter(),
  onProgress?: (processed: number, total: number) => void,
  estimateRows?: OtEstimateRow[],
): Promise<ImportSummary> {
  const toWrite: RawAttendanceInput[] = [];
  let skipped = 0;
  for (const row of rows) {
    const key = `${row.nik}::${row.tanggal}`;
    if (decisions[key] === "skip") {
      skipped += 1;
      continue;
    }
    toWrite.push({ ...row, importedBy, sourceFilename });
  }

  let inserted = 0;
  if (toWrite.length > 0) {
    onProgress?.(0, toWrite.length);
    const result = await adapter.importRawAttendance(toWrite, "overwrite", (processed) => onProgress?.(processed, toWrite.length));
    inserted = result.inserted;
  }

  const estimateResult = await commitOtEstimates(estimateRows);
  return { inserted, skipped, rejected: 0, conflicts: [], ...(estimateResult ? { estimateResult } : {}) };
}

/** Full overwrite of ot_planning_estimates for every date in `estimateRows`.
 * Isolated in its own try/catch so a failure here never rolls back the
 * attendance rows that were already written. */
async function commitOtEstimates(estimateRows: OtEstimateRow[] | undefined): Promise<ImportSummary["estimateResult"]> {
  if (!estimateRows || estimateRows.length === 0) return undefined;
  try {
    const { replaceOtEstimatesForDates } = await import("@/lib/ot-planning-service");
    const imported = await replaceOtEstimatesForDates(estimateRows);
    return { imported, dates: Array.from(new Set(estimateRows.map((r) => r.tanggal))).sort() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Gagal menyimpan estimasi OT." };
  }
}
