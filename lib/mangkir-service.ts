import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { getOtReferences } from "@/lib/ot-planning-service";
import { getSettingValue, setSettingValue } from "@/lib/database/postgres-settings";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "Report Mangkir" — Surat Panggilan escalation for Active employees'
 * unauthorized absence (raw_attendance.kategori === "Mangkir"), not merely
 * blank IT1/OT1 — a blank clock time also shows up on approved leave (Cuti,
 * Ijin, Cuti Melahirkan, ...) and national holidays, none of which are
 * "Mangkir" and must NOT count toward or break an absence episode the same
 * way.
 *
 * An "episode" is one maximal run of consecutive SCHEDULED WORK DAYS of
 * Mangkir for one employee. MANGKIR_OFF_DAY_CATEGORIES (weekly off / national
 * holiday) are skipped entirely inside a run — neither extend nor break it.
 * Every other kategori (Normal, Cuti, Ijin, Cuti Melahirkan, Dinas
 * Perusahaan, the data-quality "Error!!" category, etc.) ends the episode —
 * the employee demonstrably wasn't "gone without a trace" that day, or the
 * data is too ambiguous to accuse them on. An episode can span month
 * boundaries — dates are walked in chronological order across the whole
 * fetched range, never reset at month start.
 *
 * Two escalating warning letters per episode (company policy, mirroring the
 * "2 written summons before Pasal 168 termination" pattern in UU
 * Ketenagakerjaan):
 *   - Surat Panggilan 1 (level 1): episode reaches `sp1Threshold` days
 *     (default 3) — cites the first `sp1Threshold` dates.
 *   - Surat Panggilan 2 (level 2): episode reaches `sp2Threshold` days
 *     (default 5, i.e. 3 + 2 more) — cites the dates from sp1Threshold+1
 *     through sp2Threshold.
 * `episode_start_date` (the episode's first date) is this pair's stable key
 * in mangkir_warning_letters — a still-ongoing episode that later also
 * reaches level 2 gets its own new row there, the level-1 row untouched.
 */

const MANGKIR_KATEGORI = "Mangkir";
const MANGKIR_OFF_DAY_CATEGORIES = new Set(["Hari Libur Pemerintah", "Hari Libur/Minggu"]);

const SP1_THRESHOLD_KEY = "mangkir_sp1_threshold";
const SP2_THRESHOLD_KEY = "mangkir_sp2_threshold";
const DEFAULT_SP1_THRESHOLD = 3;
const DEFAULT_SP2_THRESHOLD = 5;

export interface MangkirThresholds {
  sp1Threshold: number;
  sp2Threshold: number;
}

export async function getMangkirThresholds(): Promise<MangkirThresholds> {
  const [sp1Raw, sp2Raw] = await Promise.all([getSettingValue(SP1_THRESHOLD_KEY), getSettingValue(SP2_THRESHOLD_KEY)]);
  const sp1 = Number(sp1Raw);
  const sp2 = Number(sp2Raw);
  return {
    sp1Threshold: Number.isFinite(sp1) && sp1 > 0 ? Math.floor(sp1) : DEFAULT_SP1_THRESHOLD,
    sp2Threshold: Number.isFinite(sp2) && sp2 > 0 ? Math.floor(sp2) : DEFAULT_SP2_THRESHOLD,
  };
}

/** `level` selects which threshold to update — Surat Panggilan 1 or 2. */
export async function setMangkirThreshold(level: 1 | 2, value: number): Promise<void> {
  const key = level === 1 ? SP1_THRESHOLD_KEY : SP2_THRESHOLD_KEY;
  const label = level === 1 ? "Surat Panggilan 1" : "Surat Panggilan 2";
  await setSettingValue(key, String(Math.max(1, Math.floor(value))), `Report Mangkir: jumlah hari kerja Mangkir berturut-turut untuk memicu ${label}.`);
}

export interface MangkirEvent {
  recordId: string;
  nik: string;
  name: string;
  position: string;
  department: string;
  shed: string;
  division: string;
  phoneNumber: string;
  level: 1 | 2;
  episodeStartDate: string;
  /** The specific dates (chronological) that trigger this level — the whole episode for level 1, only the additional days for level 2. */
  triggerDates: string[];
  /** Total episode length so far (may exceed sp2Threshold — a hint that it has gone past both letters). */
  episodeLength: number;
  sentAt: string | null;
  sentBy: string | null;
}

export interface MangkirReport extends MangkirThresholds {
  events: MangkirEvent[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** PostgREST caps unpaginated selects at 1000 rows — pages through with .range() (same fix as getTimeOverdueReport / getOtPlanning). */
async function fetchAllPages<T>(client: any, table: string, columns: string, applyFilter: (query: any) => any): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await applyFilter(client.from(table).select(columns)).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Every maximal run of consecutive Mangkir work-days for one employee's (chronologically sorted) rows. Off-day categories are skipped mid-run; any other kategori ends the run. */
function findEpisodes(rows: { tanggal: string; kategori: string | null }[]): string[][] {
  const episodes: string[][] = [];
  let streak: string[] = [];
  for (const row of rows) {
    const kategori = String(row.kategori ?? "").trim();
    if (MANGKIR_OFF_DAY_CATEGORIES.has(kategori)) continue; // neutral day — neither extends nor breaks the run
    if (kategori === MANGKIR_KATEGORI) {
      streak.push(row.tanggal);
    } else {
      if (streak.length > 0) episodes.push(streak);
      streak = [];
    }
  }
  if (streak.length > 0) episodes.push(streak);
  return episodes;
}

export async function getMangkirReport(dateFrom: string, dateTo: string): Promise<MangkirReport> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { sp1Threshold, sp2Threshold } = await getMangkirThresholds();

    type RawRow = { nik: string; nama: string; department: string; tanggal: string; kategori: string | null };
    const raw = await fetchAllPages<RawRow>(
      client, "raw_attendance", "nik,nama,department,tanggal,kategori",
      (q: any) => q.gte("tanggal", dateFrom).lte("tanggal", dateTo).order("tanggal", { ascending: true }),
    );

    const niks = Array.from(new Set(raw.map((r) => r.nik)));
    const employeeByNik = new Map<string, { recordId: string; status: string; position: string; phoneNumber: string }>();
    for (const idBatch of chunk(niks, 500)) {
      const { data, error } = await client.from("employees").select("record_id,nik,status,position,hp_number").in("nik", idBatch);
      if (error) throw error;
      for (const e of (data ?? []) as { record_id: string; nik: string; status: string; position: string; hp_number: string }[]) {
        employeeByNik.set(e.nik, { recordId: e.record_id, status: e.status, position: e.position, phoneNumber: e.hp_number });
      }
    }

    const { mappings } = await getOtReferences();
    const mapByDepartment = new Map<string, { shed: string; division: string }>(
      mappings.map((x: any) => [String(x.attendance_department).trim().toUpperCase(), { shed: String(x.shed), division: String(x.division) }]),
    );

    // Group rows per NIK — already ascending by tanggal from the query above.
    const rowsByNik = new Map<string, RawRow[]>();
    for (const row of raw) {
      const list = rowsByNik.get(row.nik) ?? [];
      list.push(row);
      rowsByNik.set(row.nik, list);
    }

    // Build every (employee, episode, level) triple first, so we can look up
    // their sent-status with one batched query instead of one per event.
    type Draft = Omit<MangkirEvent, "sentAt" | "sentBy">;
    const drafts: Draft[] = [];
    for (const [nik, rows] of rowsByNik) {
      const emp = employeeByNik.get(nik);
      if (!emp || emp.status.trim().toLowerCase() !== "active") continue;

      const episodes = findEpisodes(rows);
      if (episodes.length === 0) continue;

      const latest = rows[rows.length - 1];
      const unit = mapByDepartment.get(String(latest.department).trim().toUpperCase());
      const base = {
        recordId: emp.recordId,
        nik,
        name: String(latest.nama ?? ""),
        position: emp.position || "",
        department: String(latest.department ?? ""),
        shed: unit?.shed ?? "",
        division: unit?.division ?? "",
        phoneNumber: emp.phoneNumber || "",
      };

      for (const episode of episodes) {
        const episodeStartDate = episode[0];
        const episodeLength = episode.length;
        if (episodeLength >= sp1Threshold) {
          drafts.push({ ...base, level: 1, episodeStartDate, triggerDates: episode.slice(0, sp1Threshold), episodeLength });
        }
        if (episodeLength >= sp2Threshold) {
          drafts.push({ ...base, level: 2, episodeStartDate, triggerDates: episode.slice(sp1Threshold, sp2Threshold), episodeLength });
        }
      }
    }

    // Batch-lookup sent status for every draft event.
    const sentByKey = new Map<string, { sentAt: string | null; sentBy: string | null }>();
    if (drafts.length > 0) {
      const employeeIds = Array.from(new Set(drafts.map((d) => d.recordId)));
      for (const idBatch of chunk(employeeIds, 200)) {
        const { data, error } = await client
          .from("mangkir_warning_letters")
          .select("employee_id,episode_start_date,level,sent_at,sent_by")
          .in("employee_id", idBatch);
        if (error) throw error;
        for (const row of (data ?? []) as { employee_id: string; episode_start_date: string; level: number; sent_at: string | null; sent_by: string | null }[]) {
          sentByKey.set(`${row.employee_id}|${row.episode_start_date}|${row.level}`, { sentAt: row.sent_at, sentBy: row.sent_by });
        }
      }
    }

    const events: MangkirEvent[] = drafts.map((d) => {
      const sent = sentByKey.get(`${d.recordId}|${d.episodeStartDate}|${d.level}`);
      return { ...d, sentAt: sent?.sentAt ?? null, sentBy: sent?.sentBy ?? null };
    });

    events.sort((a, b) => b.level - a.level || b.episodeLength - a.episodeLength || a.name.localeCompare(b.name));
    return { sp1Threshold, sp2Threshold, events };
  });
}

export interface MarkMangkirLetterSentInput {
  recordId: string;
  nik: string;
  level: 1 | 2;
  episodeStartDate: string;
  triggerDates: string[];
  sentBy: string;
  phoneNumber: string;
}

/**
 * Records that a warning letter's WhatsApp/download action was used —
 * upserted by (employee, episode, level) so re-clicking just refreshes
 * sent_at/sent_by rather than erroring on the unique constraint. This is
 * "HR opened the send flow", not a delivery confirmation — wa.me only
 * pre-fills WhatsApp, it can't report whether the message was actually sent.
 */
export async function markMangkirLetterSent(input: MarkMangkirLetterSentInput): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { error } = await client.from("mangkir_warning_letters").upsert(
      {
        employee_id: input.recordId,
        nik: input.nik,
        level: input.level,
        episode_start_date: input.episodeStartDate,
        trigger_dates: input.triggerDates.join(","),
        sent_at: new Date().toISOString(),
        sent_by: input.sentBy,
        phone_number: input.phoneNumber,
      },
      { onConflict: "employee_id,episode_start_date,level" },
    );
    if (error) throw error;
  });
}
