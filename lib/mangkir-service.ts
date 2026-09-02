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
 * Two escalating warning letters per episode (company policy — Surat
 * Panggilan 1 then 2, modeled on the company's real letter templates). Each
 * cites its dates CUMULATIVELY from the start of the
 * episode, not just the days newly added since the previous letter:
 *   - Surat Panggilan 1 (level 1): episode reaches `sp1Threshold` days
 *     (default 3) — cites those `sp1Threshold` dates.
 *   - Surat Panggilan 2 (level 2): episode reaches `sp2Threshold` days
 *     (default 5, i.e. 3 + 2 more) — cites all `sp2Threshold` dates from the
 *     start of the episode.
 * An episode that keeps going past `sp2Threshold` (e.g. 8 days) has no
 * further letter yet — level 2 stays capped at its first `sp2Threshold`
 * dates; the extra days aren't dropped from the source data, just not (yet)
 * surfaced as their own escalation level.
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
  address: string;
  shed: string;
  division: string;
  phoneNumber: string;
  level: 1 | 2;
  episodeStartDate: string;
  /** The specific dates (chronological) that trigger this level — cumulative from the episode start (all sp1Threshold dates for level 1, all sp2Threshold dates for level 2). */
  triggerDates: string[];
  /** Total episode length so far (may exceed sp2Threshold — a hint that it has gone past both letters). */
  episodeLength: number;
  sentAt: string | null;
  sentBy: string | null;
  /** Free-text letter number (e.g. "5/HRD-SPK/VII/2026") HR typed in at PDF-download time — see saveMangkirLetterNumber. Empty until set. */
  letterNumber: string;
  /** Level 2 only: when this same episode's Surat Panggilan 1 was sent (cited in the SP2 letter body). Null if SP1 hasn't been sent yet. */
  previousLevelSentAt: string | null;
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
    const employeeByNik = new Map<string, { recordId: string; status: string; position: string; phoneNumber: string; address: string }>();
    for (const idBatch of chunk(niks, 500)) {
      const { data, error } = await client.from("employees").select("record_id,nik,status,position,hp_number,address").in("nik", idBatch);
      if (error) throw error;
      for (const e of (data ?? []) as { record_id: string; nik: string; status: string; position: string; hp_number: string; address: string }[]) {
        employeeByNik.set(e.nik, { recordId: e.record_id, status: e.status, position: e.position, phoneNumber: e.hp_number, address: e.address });
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
    type Draft = Omit<MangkirEvent, "sentAt" | "sentBy" | "letterNumber" | "previousLevelSentAt">;
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
        address: emp.address || "",
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
          // Cumulative — all sp2Threshold dates from the start of the episode, not just the days added since SP1.
          drafts.push({ ...base, level: 2, episodeStartDate, triggerDates: episode.slice(0, sp2Threshold), episodeLength });
        }
      }
    }

    // Batch-lookup sent status + letter number for every draft event.
    const lettersByKey = new Map<string, { sentAt: string | null; sentBy: string | null; letterNumber: string }>();
    if (drafts.length > 0) {
      const employeeIds = Array.from(new Set(drafts.map((d) => d.recordId)));
      for (const idBatch of chunk(employeeIds, 200)) {
        const { data, error } = await client
          .from("mangkir_warning_letters")
          .select("employee_id,episode_start_date,level,sent_at,sent_by,letter_number")
          .in("employee_id", idBatch);
        if (error) throw error;
        for (const row of (data ?? []) as { employee_id: string; episode_start_date: string; level: number; sent_at: string | null; sent_by: string | null; letter_number: string }[]) {
          lettersByKey.set(`${row.employee_id}|${row.episode_start_date}|${row.level}`, { sentAt: row.sent_at, sentBy: row.sent_by, letterNumber: row.letter_number ?? "" });
        }
      }
    }

    const events: MangkirEvent[] = drafts.map((d) => {
      const own = lettersByKey.get(`${d.recordId}|${d.episodeStartDate}|${d.level}`);
      // SP2's letter body cites when SP1 (same episode) was sent — look up the sibling level-1 record.
      const previousLevel = d.level === 2 ? lettersByKey.get(`${d.recordId}|${d.episodeStartDate}|1`) : undefined;
      return {
        ...d,
        sentAt: own?.sentAt ?? null,
        sentBy: own?.sentBy ?? null,
        letterNumber: own?.letterNumber ?? "",
        previousLevelSentAt: previousLevel?.sentAt ?? null,
      };
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
  /** ISO timestamp of the send — the route generates it and also returns it to the client, so the row can be patched in place without re-running the whole report. */
  sentAt: string;
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
        sent_at: input.sentAt,
        sent_by: input.sentBy,
        phone_number: input.phoneNumber,
      },
      { onConflict: "employee_id,episode_start_date,level" },
    );
    if (error) throw error;
  });
}

export interface SaveMangkirLetterNumberInput {
  recordId: string;
  nik: string;
  level: 1 | 2;
  episodeStartDate: string;
  triggerDates: string[];
  letterNumber: string;
}

/**
 * Saves the free-text letter number HR typed in before downloading a Surat
 * Panggilan PDF — upserted by (employee, episode, level) same as
 * markMangkirLetterSent, but deliberately omits sent_at/sent_by/phone_number
 * so entering a number never clobbers an already-recorded WhatsApp send (or
 * vice versa): PostgREST's upsert only SETs the columns present in the
 * payload, leaving the rest of an existing row untouched.
 */
export async function saveMangkirLetterNumber(input: SaveMangkirLetterNumberInput): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { error } = await client.from("mangkir_warning_letters").upsert(
      {
        employee_id: input.recordId,
        nik: input.nik,
        level: input.level,
        episode_start_date: input.episodeStartDate,
        trigger_dates: input.triggerDates.join(","),
        letter_number: input.letterNumber,
      },
      { onConflict: "employee_id,episode_start_date,level" },
    );
    if (error) throw error;
  });
}

/**
 * Lean lookup for the PDF route — fetches letter_number (if HR already saved
 * one for this exact event) and, for level 2, the sibling level-1 row's
 * sent_at, fresh from the DB rather than trusting client-supplied values for
 * either (both carry real document/legal weight in the letter body).
 */
export async function getMangkirLetterMeta(
  recordId: string,
  episodeStartDate: string,
  level: 1 | 2,
): Promise<{ letterNumber: string; previousLevelSentAt: string | null }> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const levels = level === 2 ? [1, 2] : [1];
    const { data, error } = await client
      .from("mangkir_warning_letters")
      .select("level,letter_number,sent_at")
      .eq("employee_id", recordId)
      .eq("episode_start_date", episodeStartDate)
      .in("level", levels);
    if (error) throw error;
    const rows = (data ?? []) as { level: number; letter_number: string; sent_at: string | null }[];
    const own = rows.find((r) => r.level === level);
    const prev = level === 2 ? rows.find((r) => r.level === 1) : undefined;
    return { letterNumber: own?.letter_number ?? "", previousLevelSentAt: prev?.sent_at ?? null };
  });
}

const SIGNER_NAME_KEY = "mangkir_signer_name";
const SIGNER_TITLE_KEY = "mangkir_signer_title";
const DEFAULT_SIGNER_NAME = "Tri Murwatiningsih,S.Psi";
const DEFAULT_SIGNER_TITLE = "Hrd Manager";

export interface MangkirSignerInfo {
  signerName: string;
  signerTitle: string;
}

/** Who signs the Surat Panggilan letters ("Hormat kami," block) — editable on the Setup tab. */
export async function getMangkirSignerInfo(): Promise<MangkirSignerInfo> {
  const [name, title] = await Promise.all([getSettingValue(SIGNER_NAME_KEY), getSettingValue(SIGNER_TITLE_KEY)]);
  return { signerName: name || DEFAULT_SIGNER_NAME, signerTitle: title || DEFAULT_SIGNER_TITLE };
}

export async function setMangkirSignerInfo(info: MangkirSignerInfo): Promise<void> {
  await Promise.all([
    setSettingValue(SIGNER_NAME_KEY, info.signerName, "Report Mangkir: nama penandatangan Surat Panggilan."),
    setSettingValue(SIGNER_TITLE_KEY, info.signerTitle, "Report Mangkir: jabatan penandatangan Surat Panggilan."),
  ]);
}
