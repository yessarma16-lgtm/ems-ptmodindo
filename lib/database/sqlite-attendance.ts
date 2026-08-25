import "server-only";
import type { DatabaseSync } from "node:sqlite";

import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { getDayType, type DayType } from "@/lib/attendance/day-type";
import { calculateOvertime } from "@/lib/attendance/overtime-rules";
import type { BracketLookupFn } from "@/lib/attendance/bracket-table";
import type { AttendanceDatabaseAdapter } from "@/lib/database/attendance-adapter";
import { AttendanceValidationError } from "@/lib/database/attendance-errors";
import type {
  BracketMasterRow,
  BracketMasterRowInput,
  BracketMasterHistoryRecord,
  BracketChangeType,
  RawAttendanceInput,
  RawAttendanceRecord,
  RawAttendanceFilter,
  ImportHistoryFilter,
  ExistingRecord,
  ImportSummary,
  ImportHistoryEntry,
  CalculatedAttendanceRecord,
  CalculatedAttendanceFilter,
  CalculationSummary,
  CalculatedStatus,
} from "@/lib/database/attendance-types";

/**
 * Implementasi SQLite dari AttendanceDatabaseAdapter. Diekspos sebagai
 * FACTORY (`createSqliteAttendanceAdapter(db)`) alih-alih langsung memakai
 * singleton `getSqliteDb()` di setiap fungsi (pola sqlite-users.ts dkk) —
 * supaya bisa ditest dengan DatabaseSync `:memory:` terisolasi, tanpa
 * menyentuh `data/employee.db` yang dipakai app beneran.
 * `sqliteAttendanceAdapter` di bawah adalah singleton yang dipakai runtime,
 * membungkus `getSqliteDb()` seperti biasa.
 */

type SqlRow = Record<string, unknown>;

function toStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}
function toNumOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}
function toStrOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function rowToBracketMaster(row: SqlRow): BracketMasterRow {
  return {
    id: toNum(row.id),
    dayType: toStr(row.day_type) as DayType,
    durasiStart: toNum(row.durasi_start),
    durasiEnd: toNum(row.durasi_end),
    otHours: toNum(row.ot_hours),
    updatedAt: toStr(row.updated_at),
    updatedBy: toStr(row.updated_by),
  };
}

function rowToHistory(row: SqlRow): BracketMasterHistoryRecord {
  return {
    id: toNum(row.id),
    bracketMasterId: toNum(row.bracket_master_id),
    dayType: toStr(row.day_type) as DayType,
    durasiStart: toNumOrNull(row.durasi_start),
    durasiEnd: toNumOrNull(row.durasi_end),
    otHours: toNumOrNull(row.ot_hours),
    changedBy: toStr(row.changed_by),
    changedAt: toStr(row.changed_at),
    changeType: toStr(row.change_type) as BracketChangeType,
  };
}

function rowToRawAttendance(row: SqlRow): RawAttendanceRecord {
  return {
    id: toNum(row.id),
    nik: toStr(row.nik),
    nama: toStr(row.nama),
    department: toStr(row.department),
    tanggal: toStr(row.tanggal),
    intime: toStrOrNull(row.intime),
    outtime: toStrOrNull(row.outtime),
    it1: toStrOrNull(row.it1),
    ot1: toStrOrNull(row.ot1),
    whour: toNumOrNull(row.whour),
    bhour: toNumOrNull(row.bhour),
    othourRecorded: toNumOrNull(row.othour_recorded),
    kategori: toStr(row.kategori),
    importedAt: toStr(row.imported_at),
    importedBy: toStr(row.imported_by),
    sourceFilename: toStr(row.source_filename),
    processStatus: row.process_status === "Done Process" ? "Done Process" : "Waiting Process",
  };
}

function rowToCalculated(row: SqlRow): CalculatedAttendanceRecord {
  return {
    id: toNum(row.id),
    rawId: toNum(row.raw_id),
    dayType: toStr(row.day_type) as DayType,
    bracketUsed: toStr(row.bracket_used),
    systemCalculatedOth: toNumOrNull(row.system_calculated_oth),
    finalOth: toNumOrNull(row.final_oth),
    status: toStr(row.status) as CalculatedStatus,
    correctedBy: toStrOrNull(row.corrected_by),
    correctedAt: toStrOrNull(row.corrected_at),
    correctionNote: toStrOrNull(row.correction_note),
    calculatedAt: toStr(row.calculated_at),
    nik: toStrOrNull(row.nik) ?? "",
    nama: toStrOrNull(row.nama) ?? "",
    department: toStrOrNull(row.department) ?? "",
    tanggal: toStrOrNull(row.tanggal) ?? "",
    intime: toStrOrNull(row.intime), outtime: toStrOrNull(row.outtime), it1: toStrOrNull(row.it1), ot1: toStrOrNull(row.ot1),
    whour: toNumOrNull(row.whour), kategori: toStr(row.kategori), othourRecorded: toNumOrNull(row.othour_recorded),
  };
}

// Match finite-precision bracket values to HH:mm-derived repeating fractions.
const EPSILON = 1e-4;
function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/** Field jam yang wajib ada supaya rule engine bisa dipanggil — kosong (Ijin/Hari Libur-Minggu/SKD dst) berarti "Tidak Berlaku", bukan error (langkah 5 di spec rule engine). */
function hasCompleteTimeFields(raw: RawAttendanceRecord): boolean {
  return raw.intime !== null && raw.outtime !== null && raw.it1 !== null && raw.ot1 !== null;
}

export function createSqliteAttendanceAdapter(db: DatabaseSync): AttendanceDatabaseAdapter {
  function makeBracketLookup(): BracketLookupFn {
    return (selisihHours, dayType) => {
      // Jam dari Excel menghasilkan pecahan floating-point (mis. 1.3 bisa
      // menjadi 1.3000000000000007). Normalisasi ke menit dan gunakan
      // toleransi supaya batas bracket tidak gagal dicocokkan.
      const normalized = Math.round(selisihHours * 60) / 60;
      const rows = db
        .prepare("SELECT ot_hours, durasi_start, durasi_end FROM bracket_master WHERE day_type = ? ORDER BY durasi_start")
        .all(dayType) as SqlRow[];
      const row = rows.find((candidate) => {
        const start = Number(candidate.durasi_start);
        const end = Number(candidate.durasi_end);
        return start - 1e-6 <= normalized && end + 1e-6 >= normalized;
      });
      return row ? toNum(row.ot_hours) : null;
    };
  }

  async function importRawAttendance(
    rows: RawAttendanceInput[],
    onConflict: "ask" | "skip" | "overwrite" = "ask",
    onProgress?: (processed: number) => void,
  ): Promise<ImportSummary> {
    if (rows.length === 0) {
      return { inserted: 0, skipped: 0, rejected: 0, conflicts: [] };
    }

    const conflicts = findExistingByNikDateSync(rows.map((r) => ({ nik: r.nik, date: r.tanggal })));
    const conflictByKey = new Map(conflicts.map((c) => [`${c.nik}::${c.tanggal}`, c]));

    let inserted = 0;
    let skipped = 0;

    const insertStmt = db.prepare(
      `INSERT INTO raw_attendance (nik, nama, department, tanggal, intime, outtime, it1, ot1, whour, bhour, othour_recorded, kategori, imported_at, imported_by, source_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateStmt = db.prepare(
      `UPDATE raw_attendance SET nama=?, department=?, intime=?, outtime=?, it1=?, ot1=?, whour=?, bhour=?, othour_recorded=?, kategori=?, imported_at=?, imported_by=?, source_filename=?
       WHERE id=?`,
    );

    db.exec("BEGIN");
    try {
      const now = new Date().toISOString();
      for (const r of rows) {
        const conflict = conflictByKey.get(`${r.nik}::${r.tanggal}`);
        if (conflict) {
          if (onConflict === "skip") {
            skipped += 1;
            continue;
          }
          if (onConflict === "overwrite") {
            updateStmt.run(
              r.nama, r.department, r.intime, r.outtime, r.it1, r.ot1,
              r.whour, r.bhour, r.othourRecorded, r.kategori, now, r.importedBy, r.sourceFilename,
              conflict.id,
            );
            inserted += 1;
          }
          // onConflict === "ask" -> tidak ditulis sama sekali, dilaporkan lewat `conflicts`
          continue;
        }
        insertStmt.run(
          r.nik, r.nama, r.department, r.tanggal, r.intime, r.outtime, r.it1, r.ot1,
          r.whour, r.bhour, r.othourRecorded, r.kategori, now, r.importedBy, r.sourceFilename,
        );
        inserted += 1;
      }
      db.exec("COMMIT");
      onProgress?.(inserted);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return { inserted, skipped, rejected: 0, conflicts };
  }

  function findExistingByNikDateSync(pairs: { nik: string; date: string }[]): ExistingRecord[] {
    if (pairs.length === 0) return [];
    const stmt = db.prepare("SELECT id, nik, tanggal FROM raw_attendance WHERE nik = ? AND tanggal = ?");
    const found: ExistingRecord[] = [];
    for (const { nik, date } of pairs) {
      const row = stmt.get(nik, date) as SqlRow | undefined;
      if (row) found.push({ id: toNum(row.id), nik: toStr(row.nik), tanggal: toStr(row.tanggal) });
    }
    return found;
  }

  async function findExistingByNikDate(pairs: { nik: string; date: string }[]): Promise<ExistingRecord[]> {
    return findExistingByNikDateSync(pairs);
  }

  async function getImportHistory(filters: ImportHistoryFilter = {}): Promise<ImportHistoryEntry[]> {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filters.dateFrom) { conditions.push("imported_at >= ?"); params.push(`${filters.dateFrom}T00:00:00.000Z`); }
    if (filters.dateTo) { conditions.push("imported_at < ?"); params.push(`${filters.dateTo}T23:59:59.999Z`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT ra.source_filename, ra.imported_at, ra.imported_by, COUNT(*) as row_count,
                CASE WHEN COUNT(ca.raw_id) = COUNT(ra.id) THEN 'Done Process' ELSE 'Waiting Process' END AS process_status
         FROM raw_attendance ra LEFT JOIN calculated_attendance ca ON ca.raw_id = ra.id ${where.replace(/\bimported_at\b/g, "ra.imported_at")}
         GROUP BY source_filename, imported_at, imported_by
         ORDER BY imported_at DESC`,
      ).all(...params) as SqlRow[];
    return rows.map((row) => ({
      sourceFilename: toStr(row.source_filename),
      importedAt: toStr(row.imported_at),
      importedBy: toStr(row.imported_by),
      rowCount: toNum(row.row_count),
      processStatus: toStr(row.process_status) === "Done Process" ? "Done Process" : "Waiting Process",
    }));
  }

  async function deleteImport(sourceFilename: string, importedAt: string): Promise<void> {
    db.exec("BEGIN");
    try {
      const rows = db.prepare("SELECT id FROM raw_attendance WHERE source_filename = ? AND imported_at = ?").all(sourceFilename, importedAt) as SqlRow[];
      const deleteCalculated = db.prepare("DELETE FROM calculated_attendance WHERE raw_id = ?");
      const deleteRaw = db.prepare("DELETE FROM raw_attendance WHERE id = ?");
      for (const row of rows) { deleteCalculated.run(toNum(row.id)); deleteRaw.run(toNum(row.id)); }
      db.exec("COMMIT");
    } catch (err) { db.exec("ROLLBACK"); throw err; }
  }

  async function getRawAttendance(filters: RawAttendanceFilter): Promise<RawAttendanceRecord[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filters.dateFrom) { conditions.push("tanggal >= ?"); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push("tanggal <= ?"); params.push(filters.dateTo); }
    if (filters.department) { conditions.push("department = ?"); params.push(filters.department); }
    if (filters.nik) { conditions.push("nik = ?"); params.push(filters.nik); }
    if (filters.sourceFilename) { conditions.push("source_filename = ?"); params.push(filters.sourceFilename); }
    if (filters.importedAt) { conditions.push("imported_at = ?"); params.push(filters.importedAt); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db.prepare(`SELECT ra.*, CASE WHEN ca.raw_id IS NULL THEN 'Waiting Process' ELSE 'Done Process' END AS process_status FROM raw_attendance ra LEFT JOIN calculated_attendance ca ON ca.raw_id = ra.id ${where.replace(/\btanggal\b/g, "ra.tanggal").replace(/\bdepartment\b/g, "ra.department").replace(/\bnik\b/g, "ra.nik").replace(/\bsource_filename\b/g, "ra.source_filename").replace(/\bimported_at\b/g, "ra.imported_at")} ORDER BY ra.tanggal, ra.nik`).all(...params) as SqlRow[];
    return rows.map(rowToRawAttendance);
  }

  async function countRawAttendance(filters: { dateFrom?: string; dateTo?: string; department?: string; search?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filters.dateFrom) { conditions.push("tanggal >= ?"); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push("tanggal <= ?"); params.push(filters.dateTo); }
    if (filters.department) { conditions.push("department = ?"); params.push(filters.department); }
    if (filters.search?.trim()) { conditions.push("(nik LIKE ? OR nama LIKE ?)"); params.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return Number((db.prepare(`SELECT COUNT(*) AS count FROM raw_attendance ${where}`).get(...params) as SqlRow).count);
  }

  async function countCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<number> {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filters.dateFrom) { conditions.push("ra.tanggal >= ?"); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push("ra.tanggal <= ?"); params.push(filters.dateTo); }
    if (filters.department) { conditions.push("ra.department = ?"); params.push(filters.department); }
    if (filters.status) { conditions.push("ca.status = ?"); params.push(filters.status); }
    if (filters.search?.trim()) { conditions.push("(ra.nik LIKE ? OR ra.nama LIKE ?)"); params.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return Number((db.prepare(`SELECT COUNT(*) AS count FROM calculated_attendance ca JOIN raw_attendance ra ON ra.id = ca.raw_id ${where}`).get(...params) as SqlRow).count);
  }

  async function updateRawAttendanceTimes(rawId: number, it1: string | null, ot1: string | null): Promise<void> {
    const result = db.prepare("UPDATE raw_attendance SET it1=?, ot1=? WHERE id=?").run(it1, ot1, rawId);
    if (Number(result.changes) === 0) throw new AttendanceValidationError(`raw_attendance id ${rawId} tidak ditemukan.`);
  }

  async function getBracketMaster(dayType?: DayType): Promise<BracketMasterRow[]> {
    const rows = dayType
      ? (db.prepare("SELECT * FROM bracket_master WHERE day_type = ? ORDER BY durasi_start").all(dayType) as SqlRow[])
      : (db.prepare("SELECT * FROM bracket_master ORDER BY day_type, durasi_start").all() as SqlRow[]);
    return rows.map(rowToBracketMaster);
  }

  function writeHistory(bracketMasterId: number, snapshot: { dayType: string; durasiStart: number | null; durasiEnd: number | null; otHours: number | null }, changedBy: string, changeType: BracketChangeType) {
    db.prepare(
      `INSERT INTO bracket_master_history (bracket_master_id, day_type, durasi_start, durasi_end, ot_hours, changed_by, changed_at, change_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(bracketMasterId, snapshot.dayType, snapshot.durasiStart, snapshot.durasiEnd, snapshot.otHours, changedBy, new Date().toISOString(), changeType);
  }

  /**
   * Diff bulk-save per day_type yang muncul di `rows` (day_type yang tidak
   * disentuh input sama sekali dibiarkan apa adanya — bukan dihapus semua).
   * Seluruh create/update/delete + tulis history terjadi dalam SATU
   * transaksi (BEGIN/COMMIT/ROLLBACK) supaya tidak bisa gagal separuh jalan.
   */
  async function updateBracketMaster(rows: BracketMasterRowInput[], changedBy: string, touchedDayTypes: DayType[] = []): Promise<void> {
    const dayTypesTouched = Array.from(new Set([...touchedDayTypes, ...rows.map((r) => r.dayType)]));
    if (dayTypesTouched.length === 0) return;
    const now = new Date().toISOString();

    db.exec("BEGIN");
    try {
      for (const dayType of dayTypesTouched) {
        const incoming = rows.filter((r) => r.dayType === dayType);
        const incomingIds = new Set(incoming.filter((r) => r.id != null).map((r) => r.id as number));
        const existingRows = db.prepare("SELECT * FROM bracket_master WHERE day_type = ?").all(dayType) as SqlRow[];

        // Hapus baris existing yang tidak lagi ada di input.
        for (const existing of existingRows) {
          const existingId = toNum(existing.id);
          if (incomingIds.has(existingId)) continue;
          writeHistory(existingId, {
            dayType: toStr(existing.day_type),
            durasiStart: toNum(existing.durasi_start),
            durasiEnd: toNum(existing.durasi_end),
            otHours: toNum(existing.ot_hours),
          }, changedBy, "deleted");
          db.prepare("DELETE FROM bracket_master WHERE id = ?").run(existingId);
        }

        const existingById = new Map(existingRows.map((r) => [toNum(r.id), r]));
        for (const row of incoming) {
          if (row.id == null) {
            const result = db
              .prepare("INSERT INTO bracket_master (day_type, durasi_start, durasi_end, ot_hours, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)")
              .run(row.dayType, row.durasiStart, row.durasiEnd, row.otHours, now, changedBy);
            const newId = Number(result.lastInsertRowid);
            writeHistory(newId, { dayType: row.dayType, durasiStart: null, durasiEnd: null, otHours: null }, changedBy, "created");
            continue;
          }

          const existing = existingById.get(row.id);
          if (!existing) {
            throw new AttendanceValidationError(`bracket_master id ${row.id} tidak ditemukan.`);
          }
          const changed =
            toNum(existing.durasi_start) !== row.durasiStart ||
            toNum(existing.durasi_end) !== row.durasiEnd ||
            toNum(existing.ot_hours) !== row.otHours;
          if (!changed) continue;

          writeHistory(row.id, {
            dayType: toStr(existing.day_type),
            durasiStart: toNum(existing.durasi_start),
            durasiEnd: toNum(existing.durasi_end),
            otHours: toNum(existing.ot_hours),
          }, changedBy, "updated");
          db.prepare("UPDATE bracket_master SET durasi_start=?, durasi_end=?, ot_hours=?, updated_at=?, updated_by=? WHERE id=?")
            .run(row.durasiStart, row.durasiEnd, row.otHours, now, changedBy, row.id);
        }
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  async function getBracketMasterHistory(bracketId?: number): Promise<BracketMasterHistoryRecord[]> {
    const rows = bracketId != null
      ? (db.prepare("SELECT * FROM bracket_master_history WHERE bracket_master_id = ? ORDER BY changed_at DESC").all(bracketId) as SqlRow[])
      : (db.prepare("SELECT * FROM bracket_master_history ORDER BY changed_at DESC").all() as SqlRow[]);
    return rows.map(rowToHistory);
  }

  async function runCrosscheck(rawIds?: number[], filters?: { dateFrom?: string; dateTo?: string }, onProgress?: (processed: number, total: number) => void, shouldCancel?: () => boolean): Promise<CalculationSummary> {
    let targets: SqlRow[] = rawIds && rawIds.length > 0
      ? (rawIds.map((id) => db.prepare("SELECT * FROM raw_attendance WHERE id = ?").get(id) as SqlRow | undefined).filter((r): r is SqlRow => !!r))
      : (db.prepare("SELECT * FROM raw_attendance ORDER BY id ASC").all() as SqlRow[]);

    const summary: CalculationSummary = { processed: 0, sesuai: 0, tidakSesuai: 0, cekManual: 0, tidakBerlaku: 0, preservedManualCorrections: 0 };
    const lookupBracket = makeBracketLookup();
    const now = new Date().toISOString();

    db.exec("BEGIN");
    try {
    if (filters?.dateFrom || filters?.dateTo) {
      targets = targets.filter((row) => {
        const date = toStr(row.tanggal);
        return (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo);
      });
    }
    const totalTargets = targets.length;
    for (const [targetIndex, targetRow] of targets.entries()) {
        if (shouldCancel?.()) throw new Error("Crosscheck dibatalkan.");
        const raw = rowToRawAttendance(targetRow);
        const dayType = getDayType(raw.tanggal);
        const existingRow = db.prepare("SELECT * FROM calculated_attendance WHERE raw_id = ?").get(raw.id) as SqlRow | undefined;

        const complete = hasCompleteTimeFields(raw);
        let systemOth: number | null = null;
        let bracketUsed = "";
        if (complete) {
          systemOth = await calculateOvertime(
            { intime: raw.intime!, it1: raw.it1!, outtime: raw.outtime!, ot1: raw.ot1!, tanggal: raw.tanggal, kategori: raw.kategori },
            lookupBracket,
          );
          bracketUsed = raw.kategori === "Hari Libur/Lembur" ? "Rumus Hari Libur/Lembur (tanpa bracket)" : `Bracket ${dayType}`;
        }

        if (existingRow && toStr(existingRow.status) === "Dikoreksi Manual") {
          db.prepare("UPDATE calculated_attendance SET system_calculated_oth=?, day_type=?, bracket_used=?, calculated_at=? WHERE id=?")
            .run(systemOth, dayType, bracketUsed, now, toNum(existingRow.id));
          summary.preservedManualCorrections += 1;
      summary.processed += 1;
      onProgress?.(targetIndex + 1, totalTargets);
          continue;
        }

        let status: CalculatedStatus;
        if (!complete) status = "Tidak Berlaku";
        else if (systemOth === null) status = "Cek Manual";
        else if (raw.othourRecorded !== null && approxEqual(systemOth, raw.othourRecorded)) status = "Sesuai";
        else status = "Tidak Sesuai";

        const finalOth = complete ? systemOth : null;

        if (existingRow) {
          db.prepare(
            `UPDATE calculated_attendance
             SET day_type=?, bracket_used=?, system_calculated_oth=?, final_oth=?, status=?, calculated_at=?, corrected_by=NULL, corrected_at=NULL, correction_note=NULL
             WHERE id=?`,
          ).run(dayType, bracketUsed, systemOth, finalOth, status, now, toNum(existingRow.id));
        } else {
          db.prepare(
            `INSERT INTO calculated_attendance (raw_id, day_type, bracket_used, system_calculated_oth, final_oth, status, calculated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).run(raw.id, dayType, bracketUsed, systemOth, finalOth, status, now);
        }

        summary.processed += 1;
        if (status === "Sesuai") summary.sesuai += 1;
        else if (status === "Tidak Sesuai") summary.tidakSesuai += 1;
        else if (status === "Cek Manual") summary.cekManual += 1;
        else if (status === "Tidak Berlaku") summary.tidakBerlaku += 1;
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return summary;
  }

  async function getCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<CalculatedAttendanceRecord[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filters.dateFrom) { conditions.push("ra.tanggal >= ?"); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push("ra.tanggal <= ?"); params.push(filters.dateTo); }
    if (filters.department) { conditions.push("ra.department = ?"); params.push(filters.department); }
    if (filters.search) { conditions.push("(ra.nik LIKE ? OR ra.nama LIKE ?)"); params.push(`%${filters.search}%`, `%${filters.search}%`); }
    if (filters.status) { conditions.push("ca.status = ?"); params.push(filters.status); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db
      .prepare(
         `SELECT ca.*, ra.nik as nik, ra.nama as nama, ra.department as department, ra.tanggal as tanggal,
                 ra.intime as intime, ra.outtime as outtime, ra.it1 as it1, ra.ot1 as ot1, ra.whour as whour, ra.kategori as kategori, ra.othour_recorded as othour_recorded
         FROM calculated_attendance ca JOIN raw_attendance ra ON ra.id = ca.raw_id
         ${where} ORDER BY ra.tanggal, ra.nik`,
      )
      .all(...params) as SqlRow[];
    return rows.map(rowToCalculated);
  }

  async function correctFinalOth(id: number, newValue: number, note: string, correctedBy: string): Promise<void> {
    if (!note.trim()) throw new AttendanceValidationError("correction_note wajib diisi.");
    const now = new Date().toISOString();
    const result = db
      .prepare("UPDATE calculated_attendance SET final_oth=?, status='Dikoreksi Manual', corrected_by=?, corrected_at=?, correction_note=? WHERE id=?")
      .run(newValue, correctedBy, now, note, id);
    if (Number(result.changes) === 0) {
      throw new AttendanceValidationError(`calculated_attendance id ${id} tidak ditemukan.`);
    }
  }

  return {
    lookupBracket: makeBracketLookup(),
    importRawAttendance,
    findExistingByNikDate,
    getRawAttendance,
    countRawAttendance,
    updateRawAttendanceTimes,
    getImportHistory,
    deleteImport,
    getBracketMaster,
    updateBracketMaster,
    getBracketMasterHistory,
    runCrosscheck,
    getCalculatedAttendance,
    countCalculatedAttendance,
    correctFinalOth,
  };
}

let cachedAdapter: AttendanceDatabaseAdapter | null = null;

/** Singleton dipakai runtime (API routes/service layer) — membungkus getSqliteDb() (data/employee.db, sama seperti adapter Employee/Master Data). */
export function getSqliteAttendanceAdapter(): AttendanceDatabaseAdapter {
  if (!cachedAdapter) cachedAdapter = createSqliteAttendanceAdapter(getSqliteDb());
  return cachedAdapter;
}
