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
  ImportHistoryFilter,
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
const ATTENDANCE_BATCH_SIZE = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

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
    processStatus: Array.isArray(row.calculated_attendance) && row.calculated_attendance.length > 0 ? "Done Process" : "Waiting Process",
  };
}

// Bracket values are stored with finite decimal precision (e.g. 1.01667),
// while HH:mm arithmetic produces repeating fractions (e.g. 1.016666...).
const EPSILON = 1e-4;
function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}
function hasCompleteTimeFields(raw: RawAttendanceRecord): boolean {
  return raw.intime !== null && raw.outtime !== null && raw.it1 !== null && raw.ot1 !== null;
}

function makeBracketLookup(): BracketLookupFn {
  return async (selisihHours, dayType) => {
    return supabaseGuarded(async () => {
      const normalized = Math.round(selisihHours * 60) / 60;
      const epsilon = EPSILON;
      const { data, error } = await getSupabaseClient()
        .from("bracket_master")
        .select("ot_hours")
        .eq("day_type", dayType)
        .lte("durasi_start", normalized + epsilon)
        .gte("durasi_end", normalized - epsilon)
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
  onProgress?: (processed: number) => void,
): Promise<ImportSummary> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, rejected: 0, conflicts: [] };

  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const conflicts = await findExistingByNikDate(rows.map((r) => ({ nik: r.nik, date: r.tanggal })));
    const conflictByKey = new Map(conflicts.map((c) => [`${c.nik}::${c.tanggal}`, c]));

    let inserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    if (onConflict === "ask") {
      return { inserted: 0, skipped: 0, rejected: 0, conflicts };
    }

    const toWrite = rows.filter((r) => {
      const conflict = conflictByKey.has(`${r.nik}::${r.tanggal}`);
      if (conflict && onConflict === "skip") {
        skipped += 1;
        return false;
      }
      return true;
    });

    for (const batch of chunks(toWrite, ATTENDANCE_BATCH_SIZE)) {
      const { error } = await client.from("raw_attendance").upsert(
        batch.map((r) => ({
          nik: r.nik, nama: r.nama, department: r.department, tanggal: r.tanggal,
          intime: r.intime, outtime: r.outtime, it1: r.it1, ot1: r.ot1,
          whour: r.whour, bhour: r.bhour, othour_recorded: r.othourRecorded, kategori: r.kategori,
          imported_at: now, imported_by: r.importedBy, source_filename: r.sourceFilename,
        })),
        { onConflict: "nik,tanggal" },
      );
      if (error) throw error;
      inserted += batch.length;
      onProgress?.(inserted);
    }

    return { inserted, skipped, rejected: 0, conflicts };
  });
}

async function findExistingByNikDate(pairs: NikDatePair[]): Promise<ExistingRecord[]> {
  if (pairs.length === 0) return [];
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const found: ExistingRecord[] = [];
    const requestedKeys = new Set(pairs.map((pair) => `${pair.nik}::${pair.date}`));
    for (const batch of chunks(pairs, ATTENDANCE_BATCH_SIZE)) {
      const niks = Array.from(new Set(batch.map((pair) => pair.nik)));
      const dates = Array.from(new Set(batch.map((pair) => pair.date)));
      const { data, error } = await client
        .from("raw_attendance")
        .select("id, nik, tanggal")
        .in("nik", niks)
        .in("tanggal", dates);
      if (error) throw error;
      for (const row of (data ?? []) as SqlRow[]) {
        const nik = toStr(row.nik);
        const tanggal = toStr(row.tanggal);
        if (requestedKeys.has(`${nik}::${tanggal}`)) {
          found.push({ id: toNum(row.id), nik, tanggal });
        }
      }
    }
    return found;
  });
}

async function getImportHistory(filters: ImportHistoryFilter = {}): Promise<ImportHistoryEntry[]> {
  return supabaseGuarded(async () => {
    // PostgREST tidak punya GROUP BY di query builder -- ambil kolom yang
    // relevan saja lalu group di sisi aplikasi, sama seperti workaround
    // NOT EXISTS di runCrosscheck().
    const PAGE_SIZE = 1000;
    let countQuery = getSupabaseClient().from("raw_attendance").select("id", { count: "exact", head: true });
    if (filters.dateFrom) countQuery = countQuery.gte("imported_at", `${filters.dateFrom}T00:00:00.000Z`);
    if (filters.dateTo) countQuery = countQuery.lte("imported_at", `${filters.dateTo}T23:59:59.999Z`);
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;
    const pageCount = Math.ceil((count ?? 0) / PAGE_SIZE);
    const pages = await Promise.all(Array.from({ length: pageCount }, async (_, page) => {
      let query = getSupabaseClient().from("raw_attendance").select("id, source_filename, imported_at, imported_by, calculated_attendance(id)");
      if (filters.dateFrom) query = query.gte("imported_at", `${filters.dateFrom}T00:00:00.000Z`);
      if (filters.dateTo) query = query.lte("imported_at", `${filters.dateTo}T23:59:59.999Z`);
      const { data, error } = await query.order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as SqlRow[];
    }));
    const allRows = pages.flat();
    const grouped = new Map<string, ImportHistoryEntry>();
    for (const row of allRows) {
      const key = `${toStr(row.source_filename)}::${toStr(row.imported_at)}::${toStr(row.imported_by)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.rowCount += 1;
        if (!(Array.isArray(row.calculated_attendance) && row.calculated_attendance.length > 0)) existing.processStatus = "Waiting Process";
      } else grouped.set(key, { sourceFilename: toStr(row.source_filename), importedAt: toStr(row.imported_at), importedBy: toStr(row.imported_by), rowCount: 1, processStatus: Array.isArray(row.calculated_attendance) && row.calculated_attendance.length > 0 ? "Done Process" : "Waiting Process" });
    }
    return Array.from(grouped.values()).sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
  });
}

async function deleteImport(sourceFilename: string, importedAt: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const PAGE_SIZE = 1000;
    const ids: number[] = [];
    for (let page = 0; ; page += 1) {
      const { data, error } = await client
        .from("raw_attendance")
        .select("id")
        .eq("source_filename", sourceFilename)
        .eq("imported_at", importedAt)
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      const pageIds = (data ?? []).map((row: Record<string, unknown>) => toNum(row.id));
      ids.push(...pageIds);
      if (pageIds.length < PAGE_SIZE) break;
    }

    // Remove dependants first because raw_attendance uses ON DELETE RESTRICT.
    for (const idBatch of chunks(ids, 500)) {
      const calc = await client.from("calculated_attendance").delete().in("raw_id", idBatch);
      if (calc.error) throw calc.error;
    }
    for (const idBatch of chunks(ids, 500)) {
      const raw = await client.from("raw_attendance").delete().in("id", idBatch);
      if (raw.error) throw raw.error;
    }
  });
}

/** PostgREST caps unpaginated selects at 1000 rows — a single day's raw_attendance already exceeds that, so this always pages through with .range() instead of trusting one request to return everything (same fix as getOtPlanning/getTimeOverdueReport). */
async function getRawAttendance(filters: RawAttendanceFilter): Promise<RawAttendanceRecord[]> {
  return supabaseGuarded(async () => {
    const applyFilters = (q: any) => {
      if (filters.dateFrom) q = q.gte("tanggal", filters.dateFrom);
      if (filters.dateTo) q = q.lte("tanggal", filters.dateTo);
      if (filters.department) q = q.eq("department", filters.department);
      if (filters.nik) q = q.eq("nik", filters.nik);
      if (filters.sourceFilename) q = q.eq("source_filename", filters.sourceFilename);
      if (filters.importedAt) q = q.eq("imported_at", filters.importedAt);
      return q;
    };
    const PAGE_SIZE = 1000;
    const rows: SqlRow[] = [];
    for (let page = 0; ; page += 1) {
      const query = applyFilters(getSupabaseClient().from("raw_attendance").select("*, calculated_attendance(id)"))
        .order("tanggal", { ascending: true })
        .order("nik", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...((data ?? []) as SqlRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows.map(rowToRawAttendance);
  });
}

async function countRawAttendance(filters: { dateFrom?: string; dateTo?: string; department?: string; search?: string }): Promise<number> {
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from("raw_attendance").select("id", { count: "exact", head: true });
    if (filters.dateFrom) query = query.gte("tanggal", filters.dateFrom);
    if (filters.dateTo) query = query.lte("tanggal", filters.dateTo);
    if (filters.department) query = query.eq("department", filters.department);
    if (filters.search) {
      const search = filters.search.trim();
      if (search) query = query.or(`nik.ilike.%${search}%,nama.ilike.%${search}%`);
    }
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  });
}

async function updateRawAttendanceTimes(rawId: number, it1: string | null, ot1: string | null): Promise<void> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("raw_attendance").update({ it1, ot1 }).eq("id", rawId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new AttendanceValidationError(`raw_attendance id ${rawId} tidak ditemukan.`);
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

async function runCrosscheckFast(rawIds?: number[], filters: { dateFrom?: string; dateTo?: string; limit?: number } = {}, onProgress?: (processed: number, total: number) => void, shouldCancel?: () => boolean): Promise<CalculationSummary> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const PAGE_SIZE = 1000;
    let targets: SqlRow[] = [];

    if (rawIds && rawIds.length > 0) {
      let query = client.from("raw_attendance").select("*").in("id", rawIds);
      if (filters.dateFrom) query = query.gte("tanggal", filters.dateFrom);
      if (filters.dateTo) query = query.lte("tanggal", filters.dateTo);
      const { data, error } = await query.order("id", { ascending: true });
      if (error) throw error;
      targets = (data ?? []) as SqlRow[];
    } else {
      let countQuery = client.from("raw_attendance").select("id", { count: "exact", head: true });
      if (filters.dateFrom) countQuery = countQuery.gte("tanggal", filters.dateFrom);
      if (filters.dateTo) countQuery = countQuery.lte("tanggal", filters.dateTo);
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const rawPages = await Promise.all(Array.from({ length: Math.ceil((count ?? 0) / PAGE_SIZE) }, async (_, page) => {
        let query = client.from("raw_attendance").select("*");
        if (filters.dateFrom) query = query.gte("tanggal", filters.dateFrom);
        if (filters.dateTo) query = query.lte("tanggal", filters.dateTo);
        const { data, error } = await query.order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as SqlRow[];
      }));

      // Calculate ulang seluruh raw attendance dalam rentang yang dipilih.
      // Baris yang sudah pernah dihitung tetap dimuat agar hasil kalkulasi
      // dapat diperbarui; koreksi manual dilindungi di loop di bawah.
      targets = rawPages.flat();
    }

    if (filters.limit && filters.limit > 0) targets = targets.slice(0, filters.limit);

    const bracketRows = await getBracketMaster();
    const lookupBracket: BracketLookupFn = (selisihHours, dayType) => {
      const normalized = Math.round(selisihHours * 60) / 60;
      const row = bracketRows.find((candidate) => candidate.dayType === dayType && candidate.durasiStart - EPSILON <= normalized && candidate.durasiEnd + EPSILON >= normalized);
      return row?.otHours ?? null;
    };

    const existingByRawId = new Map<number, SqlRow>();
    for (const idBatch of chunks(targets.map((row) => toNum(row.id)), ATTENDANCE_BATCH_SIZE)) {
      const { data, error } = await client.from("calculated_attendance").select("*").in("raw_id", idBatch);
      if (error) throw error;
      for (const row of (data ?? []) as SqlRow[]) existingByRawId.set(toNum(row.raw_id), row);
    }

    const summary: CalculationSummary = { processed: 0, sesuai: 0, tidakSesuai: 0, cekManual: 0, tidakBerlaku: 0, preservedManualCorrections: 0 };
    const now = new Date().toISOString();
    const pending: SqlRow[] = [];

    for (const rawRow of targets) {
      if (shouldCancel?.()) throw new Error("Crosscheck dibatalkan.");
      const raw = rowToRawAttendance(rawRow);
      const dayType = getDayType(raw.tanggal);
      const existing = existingByRawId.get(raw.id);
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

      if (existing && toStr(existing.status) === "Dikoreksi Manual") {
        pending.push({ raw_id: raw.id, day_type: dayType, bracket_used: bracketUsed, system_calculated_oth: systemOth, final_oth: toNumOrNull(existing.final_oth), status: existing.status, calculated_at: now, corrected_by: existing.corrected_by, corrected_at: existing.corrected_at, correction_note: existing.correction_note });
        summary.preservedManualCorrections += 1;
      } else {
        const status: CalculatedStatus = !complete ? "Tidak Berlaku" : systemOth === null ? "Cek Manual" : raw.othourRecorded !== null && approxEqual(systemOth, raw.othourRecorded) ? "Sesuai" : "Tidak Sesuai";
        pending.push({ raw_id: raw.id, day_type: dayType, bracket_used: bracketUsed, system_calculated_oth: systemOth, final_oth: complete ? systemOth : null, status, calculated_at: now, corrected_by: null, corrected_at: null, correction_note: null });
        if (status === "Sesuai") summary.sesuai += 1;
        else if (status === "Tidak Sesuai") summary.tidakSesuai += 1;
        else if (status === "Cek Manual") summary.cekManual += 1;
        else if (status === "Tidak Berlaku") summary.tidakBerlaku += 1;
      }

      if (pending.length >= 100) onProgress?.(pending.length, targets.length);
    }

    for (const batch of chunks(pending, ATTENDANCE_BATCH_SIZE)) {
      if (shouldCancel?.()) throw new Error("Crosscheck dibatalkan.");
      const { error } = await client.from("calculated_attendance").upsert(batch, { onConflict: "raw_id" });
      if (error) throw error;
      summary.processed += batch.length;
      onProgress?.(summary.processed, targets.length);
    }
    return summary;
  });
}

async function runCrosscheck(rawIds?: number[], filters: { dateFrom?: string; dateTo?: string; limit?: number } = {}, onProgress?: (processed: number, total: number) => void, shouldCancel?: () => boolean): Promise<CalculationSummary> {
  return runCrosscheckFast(rawIds, filters, onProgress, shouldCancel);
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    let targets: SqlRow[];
    if (rawIds && rawIds.length > 0) {
      let query = client.from("raw_attendance").select("*").in("id", rawIds);
      if (filters.dateFrom) query = query.gte("tanggal", filters.dateFrom);
      if (filters.dateTo) query = query.lte("tanggal", filters.dateTo);
      const { data, error } = await query;
      if (error) throw error;
      targets = data as SqlRow[];
    } else {
      // PostgREST tidak punya NOT EXISTS langsung -- ambil semua raw_id yang
      // sudah dihitung, lalu exclude di sisi aplikasi. Cukup untuk volume
      // attendance bulanan; kalau data membesar signifikan, pertimbangkan
      // fungsi Postgres khusus seperti update_bracket_master.
      let rawCountQuery = client.from("raw_attendance").select("id", { count: "exact", head: true });
      if (filters.dateFrom) rawCountQuery = rawCountQuery.gte("tanggal", filters.dateFrom);
      if (filters.dateTo) rawCountQuery = rawCountQuery.lte("tanggal", filters.dateTo);
      const [{ count: rawCount, error: rawCountErr }, { count: calculatedCount, error: calculatedCountErr }] = await Promise.all([
        rawCountQuery,
        client.from("calculated_attendance").select("id", { count: "exact", head: true }),
      ]);
      if (rawCountErr) throw rawCountErr;
      if (calculatedCountErr) throw calculatedCountErr;
      const rawPageCount = Math.ceil((rawCount ?? 0) / ATTENDANCE_BATCH_SIZE);
      const calcPageCount = Math.ceil((calculatedCount ?? 0) / ATTENDANCE_BATCH_SIZE);
      const [rawPages, calcPages] = await Promise.all([
        Promise.all(Array.from({ length: rawPageCount }, async (_, page) => {
          let pageQuery = client.from("raw_attendance").select("*");
          if (filters.dateFrom) pageQuery = pageQuery.gte("tanggal", filters.dateFrom);
          if (filters.dateTo) pageQuery = pageQuery.lte("tanggal", filters.dateTo);
          const { data, error } = await pageQuery.order("id", { ascending: true }).range(page * ATTENDANCE_BATCH_SIZE, (page + 1) * ATTENDANCE_BATCH_SIZE - 1);
          if (error) throw error;
          return (data ?? []) as SqlRow[];
        })),
        Promise.all(Array.from({ length: calcPageCount }, async (_, page) => {
          const { data, error } = await client.from("calculated_attendance").select("raw_id").order("id", { ascending: true }).range(page * ATTENDANCE_BATCH_SIZE, (page + 1) * ATTENDANCE_BATCH_SIZE - 1);
          if (error) throw error;
          return (data ?? []) as SqlRow[];
        })),
      ]);
      const calculatedIds = new Set(calcPages.flat().map((r) => toNum(r.raw_id)));
      targets = rawPages.flat().filter((r) => !calculatedIds.has(toNum(r.id)));
    }

    const summary: CalculationSummary = { processed: 0, sesuai: 0, tidakSesuai: 0, cekManual: 0, tidakBerlaku: 0, preservedManualCorrections: 0 };
    const bracketRows = await getBracketMaster();
    const lookupBracket: BracketLookupFn = (selisihHours, dayType) => {
      const normalized = Math.round(selisihHours * 60) / 60;
      const row = bracketRows.find((candidate) => candidate.dayType === dayType && candidate.durasiStart - EPSILON <= normalized && candidate.durasiEnd + EPSILON >= normalized);
      return row?.otHours ?? null;
    };
    const now = new Date().toISOString();

    const totalTargets = targets.length;
    for (const [targetIndex, targetRow] of targets.entries()) {
      if (shouldCancel?.()) throw new Error("Crosscheck dibatalkan.");
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
      onProgress?.(targetIndex + 1, totalTargets);
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
    let countQuery = getSupabaseClient().from("calculated_attendance").select("id, raw_attendance!inner(tanggal, department)", { count: "exact", head: true });
    if (filters.status) countQuery = countQuery.eq("status", filters.status);
    if (filters.dateFrom) countQuery = countQuery.gte("raw_attendance.tanggal", filters.dateFrom);
    if (filters.dateTo) countQuery = countQuery.lte("raw_attendance.tanggal", filters.dateTo);
    if (filters.department) countQuery = countQuery.eq("raw_attendance.department", filters.department);
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;
    const pageCount = Math.ceil((count ?? 0) / ATTENDANCE_BATCH_SIZE);
    const pages = await Promise.all(Array.from({ length: pageCount }, async (_, page) => {
      let pageQuery = getSupabaseClient()
        .from("calculated_attendance")
        .select("*, raw_attendance!inner(nik, nama, department, tanggal, intime, outtime, it1, ot1, whour, kategori)");
      if (filters.status) pageQuery = pageQuery.eq("status", filters.status);
      if (filters.dateFrom) pageQuery = pageQuery.gte("raw_attendance.tanggal", filters.dateFrom);
      if (filters.dateTo) pageQuery = pageQuery.lte("raw_attendance.tanggal", filters.dateTo);
      if (filters.department) pageQuery = pageQuery.eq("raw_attendance.department", filters.department);
      const { data, error } = await pageQuery.order("id", { ascending: true }).range(page * ATTENDANCE_BATCH_SIZE, (page + 1) * ATTENDANCE_BATCH_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as SqlRow[];
    }));
    const data = pages.flat();
    const search = filters.search?.toLowerCase();
    return (data as SqlRow[]).filter((row) => {
      if (!search) return true;
      const ra = row.raw_attendance as SqlRow;
      return `${toStr(ra?.nik)} ${toStr(ra?.nama)}`.toLowerCase().includes(search);
    }).map((row) => {
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
        intime: toStrOrNull(ra?.intime), outtime: toStrOrNull(ra?.outtime), it1: toStrOrNull(ra?.it1), ot1: toStrOrNull(ra?.ot1),
        whour: toNumOrNull(ra?.whour), kategori: toStr(ra?.kategori),
      };
    });
  });
}

async function countCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<number> {
  return supabaseGuarded(async () => {
    let query = getSupabaseClient()
      .from("calculated_attendance")
      .select("id, raw_attendance!inner(nik, nama, department, tanggal)", { count: "exact", head: true });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.dateFrom) query = query.gte("raw_attendance.tanggal", filters.dateFrom);
    if (filters.dateTo) query = query.lte("raw_attendance.tanggal", filters.dateTo);
    if (filters.department) query = query.eq("raw_attendance.department", filters.department);
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      query = query.or(`nik.ilike.%${search}%,nama.ilike.%${search}%`, { referencedTable: "raw_attendance" });
    }
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
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
  return cachedAdapter;
}
