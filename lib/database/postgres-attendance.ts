import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { getDayType, type DayType } from "@/lib/attendance/day-type";
import { calculateOvertime } from "@/lib/attendance/overtime-rules";
import type { BracketLookupFn } from "@/lib/attendance/bracket-table";
import type { AttendanceDatabaseAdapter } from "@/lib/database/attendance-adapter";
import { AttendanceValidationError } from "@/lib/database/attendance-errors";
import type {
  BracketMasterRow,
  BracketMasterRowInput,
  BracketMasterHistoryRecord,
  RawAttendanceInput,
  RawAttendanceRecord,
  RawAttendanceFilter,
  ExistingRecord,
  ImportSummary,
  ImportHistoryEntry,
  NikDatePair,
  CalculatedAttendanceRecord,
  CalculatedAttendanceFilter,
  CalculationSummary,
  CalculatedStatus,
} from "@/lib/database/attendance-types";

/**
 * Implementasi Postgres (Supabase/PostgREST) dari AttendanceDatabaseAdapter
 * — mirror sqlite-attendance.ts. STATUS: ditulis mengikuti pola
 * postgres-users.ts/postgres-online-registrations.ts persis, TAPI belum
 * diverifikasi jalan terhadap instance Supabase asli (tidak ada kredensial
 * live di lingkungan development ini) — beda dengan sqlite-attendance.ts
 * yang sudah ditest langsung lewat __tests__/attendance/attendance-adapter.test.ts.
 * `updateBracketMaster` mendelegasikan transaksinya ke fungsi Postgres
 * `update_bracket_master` (dibuat oleh `npm run db:init:postgres`, lihat
 * postgres-init.ts) via `.rpc()` — alasan yang sama dengan
 * `approve_online_registration`: PostgREST tidak punya BEGIN/COMMIT
 * lintas-statement dari sisi client.
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
  };
}

const EPSILON = 1e-6;
function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}
function hasCompleteTimeFields(raw: RawAttendanceRecord): boolean {
  return raw.intime !== null && raw.outtime !== null && raw.it1 !== null && raw.ot1 !== null;
}

function makeBracketLookup(): BracketLookupFn {
  return async (selisihHours, dayType) => {
    return supabaseGuarded(async () => {
      const { data, error } = await getSupabaseClient()
        .from("bracket_master")
        .select("ot_hours")
        .eq("day_type", dayType)
        .lte("durasi_start", selisihHours)
        .gte("durasi_end", selisihHours)
        .order("durasi_start", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toNum((data as SqlRow).ot_hours) : null;
    });
  };
}

async function importRawAttendance(
  rows: RawAttendanceInput[],
  onConflict: "ask" | "skip" | "overwrite" = "ask",
): Promise<ImportSummary> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, rejected: 0, conflicts: [] };

  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const conflicts = await findExistingByNikDate(rows.map((r) => ({ nik: r.nik, date: r.tanggal })));
    const conflictByKey = new Map(conflicts.map((c) => [`${c.nik}::${c.tanggal}`, c]));

    let inserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const r of rows) {
      const conflict = conflictByKey.get(`${r.nik}::${r.tanggal}`);
      if (conflict) {
        if (onConflict === "skip") { skipped += 1; continue; }
        if (onConflict === "overwrite") {
          const { error } = await client
            .from("raw_attendance")
            .update({
              nama: r.nama, department: r.department, intime: r.intime, outtime: r.outtime, it1: r.it1, ot1: r.ot1,
              whour: r.whour, bhour: r.bhour, othour_recorded: r.othourRecorded, kategori: r.kategori,
              imported_at: now, imported_by: r.importedBy, source_filename: r.sourceFilename,
            })
            .eq("id", conflict.id);
          if (error) throw error;
          inserted += 1;
        }
        continue;
      }
      const { error } = await client.from("raw_attendance").insert({
        nik: r.nik, nama: r.nama, department: r.department, tanggal: r.tanggal,
        intime: r.intime, outtime: r.outtime, it1: r.it1, ot1: r.ot1,
        whour: r.whour, bhour: r.bhour, othour_recorded: r.othourRecorded, kategori: r.kategori,
        imported_at: now, imported_by: r.importedBy, source_filename: r.sourceFilename,
      });
      if (error) throw error;
      inserted += 1;
    }

    return { inserted, skipped, rejected: 0, conflicts };
  });
}

async function findExistingByNikDate(pairs: NikDatePair[]): Promise<ExistingRecord[]> {
  if (pairs.length === 0) return [];
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const found: ExistingRecord[] = [];
    for (const { nik, date } of pairs) {
      const { data, error } = await client.from("raw_attendance").select("id, nik, tanggal").eq("nik", nik).eq("tanggal", date).maybeSingle();
      if (error) throw error;
      if (data) found.push({ id: toNum((data as SqlRow).id), nik: toStr((data as SqlRow).nik), tanggal: toStr((data as SqlRow).tanggal) });
    }
    return found;
  });
}

async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  return supabaseGuarded(async () => {
    // PostgREST tidak punya GROUP BY di query builder -- ambil kolom yang
    // relevan saja lalu group di sisi aplikasi, sama seperti workaround
    // NOT EXISTS di runCrosscheck().
    const { data, error } = await getSupabaseClient().from("raw_attendance").select("source_filename, imported_at, imported_by");
    if (error) throw error;
    const grouped = new Map<string, ImportHistoryEntry>();
    for (const row of data as SqlRow[]) {
      const key = `${toStr(row.source_filename)}::${toStr(row.imported_at)}::${toStr(row.imported_by)}`;
      const existing = grouped.get(key);
      if (existing) existing.rowCount += 1;
      else grouped.set(key, { sourceFilename: toStr(row.source_filename), importedAt: toStr(row.imported_at), importedBy: toStr(row.imported_by), rowCount: 1 });
    }
    return Array.from(grouped.values()).sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
  });
}

async function getRawAttendance(filters: RawAttendanceFilter): Promise<RawAttendanceRecord[]> {
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from("raw_attendance").select("*");
    if (filters.dateFrom) query = query.gte("tanggal", filters.dateFrom);
    if (filters.dateTo) query = query.lte("tanggal", filters.dateTo);
    if (filters.department) query = query.eq("department", filters.department);
    if (filters.nik) query = query.eq("nik", filters.nik);
    const { data, error } = await query.order("tanggal", { ascending: true }).order("nik", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToRawAttendance);
  });
}

async function getBracketMaster(dayType?: DayType): Promise<BracketMasterRow[]> {
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from("bracket_master").select("*");
    if (dayType) query = query.eq("day_type", dayType);
    const { data, error } = await query.order("day_type", { ascending: true }).order("durasi_start", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToBracketMaster);
  });
}

/** Delegasi ke fungsi Postgres update_bracket_master (lihat postgres-init.ts) supaya history-write + update atomik lewat satu panggilan RPC. */
async function updateBracketMaster(rows: BracketMasterRowInput[], changedBy: string, touchedDayTypes: DayType[] = []): Promise<void> {
  const dayTypesTouched = Array.from(new Set([...touchedDayTypes, ...rows.map((r) => r.dayType)]));
  if (dayTypesTouched.length === 0) return;
  return supabaseGuarded(async () => {
    const payload = rows.map((r) => ({
      id: r.id ?? null,
      day_type: r.dayType,
      durasi_start: r.durasiStart,
      durasi_end: r.durasiEnd,
      ot_hours: r.otHours,
    }));
    const { error } = await getSupabaseClient().rpc("update_bracket_master", {
      p_rows: payload,
      p_changed_by: changedBy,
      p_day_types: dayTypesTouched,
    });
    if (error) throw error;
  });
}

async function getBracketMasterHistory(bracketId?: number): Promise<BracketMasterHistoryRecord[]> {
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from("bracket_master_history").select("*");
    if (bracketId != null) query = query.eq("bracket_master_id", bracketId);
    const { data, error } = await query.order("changed_at", { ascending: false });
    if (error) throw error;
    return (data as SqlRow[]).map((row) => ({
      id: toNum(row.id),
      bracketMasterId: toNum(row.bracket_master_id),
      dayType: toStr(row.day_type) as DayType,
      durasiStart: toNumOrNull(row.durasi_start),
      durasiEnd: toNumOrNull(row.durasi_end),
      otHours: toNumOrNull(row.ot_hours),
      changedBy: toStr(row.changed_by),
      changedAt: toStr(row.changed_at),
      changeType: toStr(row.change_type) as BracketMasterHistoryRecord["changeType"],
    }));
  });
}

async function runCrosscheck(rawIds?: number[]): Promise<CalculationSummary> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    let targets: SqlRow[];
    if (rawIds && rawIds.length > 0) {
      const { data, error } = await client.from("raw_attendance").select("*").in("id", rawIds);
      if (error) throw error;
      targets = data as SqlRow[];
    } else {
      // PostgREST tidak punya NOT EXISTS langsung -- ambil semua raw_id yang
      // sudah dihitung, lalu exclude di sisi aplikasi. Cukup untuk volume
      // attendance bulanan; kalau data membesar signifikan, pertimbangkan
      // fungsi Postgres khusus seperti update_bracket_master.
      const [{ data: allRaw, error: rawErr }, { data: calculated, error: calcErr }] = await Promise.all([
        client.from("raw_attendance").select("*"),
        client.from("calculated_attendance").select("raw_id"),
      ]);
      if (rawErr) throw rawErr;
      if (calcErr) throw calcErr;
      const calculatedIds = new Set((calculated as SqlRow[]).map((r) => toNum(r.raw_id)));
      targets = (allRaw as SqlRow[]).filter((r) => !calculatedIds.has(toNum(r.id)));
    }

    const summary: CalculationSummary = { processed: 0, sesuai: 0, tidakSesuai: 0, cekManual: 0, tidakBerlaku: 0, preservedManualCorrections: 0 };
    const lookupBracket = makeBracketLookup();
    const now = new Date().toISOString();

    for (const targetRow of targets) {
      const raw = rowToRawAttendance(targetRow);
      const dayType = getDayType(raw.tanggal);
      const { data: existingData, error: existingErr } = await client
        .from("calculated_attendance").select("*").eq("raw_id", raw.id).maybeSingle();
      if (existingErr) throw existingErr;
      const existingRow = existingData as SqlRow | null;

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
        const { error } = await client.from("calculated_attendance").update({
          system_calculated_oth: systemOth, day_type: dayType, bracket_used: bracketUsed, calculated_at: now,
        }).eq("id", toNum(existingRow.id));
        if (error) throw error;
        summary.preservedManualCorrections += 1;
        summary.processed += 1;
        continue;
      }

      let status: CalculatedStatus;
      if (!complete) status = "Tidak Berlaku";
      else if (systemOth === null) status = "Cek Manual";
      else if (raw.othourRecorded !== null && approxEqual(systemOth, raw.othourRecorded)) status = "Sesuai";
      else status = "Tidak Sesuai";
      const finalOth = complete ? systemOth : null;

      if (existingRow) {
        const { error } = await client.from("calculated_attendance").update({
          day_type: dayType, bracket_used: bracketUsed, system_calculated_oth: systemOth, final_oth: finalOth,
          status, calculated_at: now, corrected_by: null, corrected_at: null, correction_note: null,
        }).eq("id", toNum(existingRow.id));
        if (error) throw error;
      } else {
        const { error } = await client.from("calculated_attendance").insert({
          raw_id: raw.id, day_type: dayType, bracket_used: bracketUsed, system_calculated_oth: systemOth,
          final_oth: finalOth, status, calculated_at: now,
        });
        if (error) throw error;
      }

      summary.processed += 1;
      if (status === "Sesuai") summary.sesuai += 1;
      else if (status === "Tidak Sesuai") summary.tidakSesuai += 1;
      else if (status === "Cek Manual") summary.cekManual += 1;
      else if (status === "Tidak Berlaku") summary.tidakBerlaku += 1;
    }

    return summary;
  });
}

async function getCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<CalculatedAttendanceRecord[]> {
  return supabaseGuarded(async () => {
    // PostgREST embed: calculated_attendance.raw_id -> raw_attendance(*), butuh FK yang sudah ada di schema.
    let query = getSupabaseClient()
      .from("calculated_attendance")
      .select("*, raw_attendance!inner(nik, nama, department, tanggal)");
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.dateFrom) query = query.gte("raw_attendance.tanggal", filters.dateFrom);
    if (filters.dateTo) query = query.lte("raw_attendance.tanggal", filters.dateTo);
    if (filters.department) query = query.eq("raw_attendance.department", filters.department);
    const { data, error } = await query;
    if (error) throw error;
    return (data as SqlRow[]).map((row) => {
      const ra = row.raw_attendance as SqlRow;
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
        nik: toStr(ra?.nik),
        nama: toStr(ra?.nama),
        department: toStr(ra?.department),
        tanggal: toStr(ra?.tanggal),
      };
    });
  });
}

async function correctFinalOth(id: number, newValue: number, note: string, correctedBy: string): Promise<void> {
  if (!note.trim()) throw new AttendanceValidationError("correction_note wajib diisi.");
  return supabaseGuarded(async () => {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from("calculated_attendance")
      .update({ final_oth: newValue, status: "Dikoreksi Manual", corrected_by: correctedBy, corrected_at: now, correction_note: note })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new AttendanceValidationError(`calculated_attendance id ${id} tidak ditemukan.`);
  });
}

let cachedAdapter: AttendanceDatabaseAdapter | null = null;

export function getPostgresAttendanceAdapter(): AttendanceDatabaseAdapter {
  if (!cachedAdapter) {
    cachedAdapter = {
      lookupBracket: makeBracketLookup(),
      importRawAttendance,
      findExistingByNikDate,
      getRawAttendance,
      getImportHistory,
      getBracketMaster,
      updateBracketMaster,
      getBracketMasterHistory,
      runCrosscheck,
      getCalculatedAttendance,
      correctFinalOth,
    };
  }
  return cachedAdapter;
}
