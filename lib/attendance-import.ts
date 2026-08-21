import "server-only";

import { parseAttendanceImportWorkbook, ImportParseError, type RawAttendanceRejectedRow } from "@/lib/attendance/importer";
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

export interface AttendanceImportPreview {
  sourceFilename: string;
  validRows: AttendanceImportPreviewRow[];
  conflicts: AttendanceConflictPreview[];
  rejected: RawAttendanceRejectedRow[];
}

export async function previewAttendanceImport(
  buffer: Buffer,
  sourceFilename: string,
  adapter: AttendanceDatabaseAdapter = getAttendanceAdapter(),
): Promise<AttendanceImportPreview> {
  const parsed = await parseAttendanceImportWorkbook(buffer);

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
    return { sourceFilename, validRows: [], conflicts: [], rejected: parsed.rejected };
  }

  const existing = await adapter.findExistingByNikDate(mapped.map((m) => ({ nik: m.input.nik, date: m.input.tanggal })));
  if (existing.length === 0) {
    return { sourceFilename, validRows: mapped, conflicts: [], rejected: parsed.rejected };
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

  return { sourceFilename, validRows, conflicts, rejected: parsed.rejected };
}

/** `rows` tanpa importedBy/sourceFilename -- keduanya diketahui di sini (session user, nama file dari step preview), bukan dikirim balik oleh client. */
export type CommitRowInput = Omit<RawAttendanceInput, "importedBy" | "sourceFilename">;

export async function commitAttendanceImport(
  rows: CommitRowInput[],
  decisions: Record<string, "overwrite" | "skip">,
  importedBy: string,
  sourceFilename: string,
  adapter: AttendanceDatabaseAdapter = getAttendanceAdapter(),
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

  if (toWrite.length === 0) {
    return { inserted: 0, skipped, rejected: 0, conflicts: [] };
  }

  const result = await adapter.importRawAttendance(toWrite, "overwrite");
  return { inserted: result.inserted, skipped, rejected: 0, conflicts: [] };
}
