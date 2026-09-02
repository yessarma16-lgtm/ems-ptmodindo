import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { OT_DURATION_MULTIPLIER_SEED } from "@/config/ot-planning-multipliers";

/**
 * Attendance kategori that switches an OT row from the regular pay bracket
 * (paid_hours) to the National Holiday bracket (paid_hours_holiday). Only this
 * one — "Hari Libur/Minggu" and "Hari Libur/Lembur" stay on the regular
 * bracket (see NO_BRACKET_HOLIDAY_CATEGORIES in lib/attendance/overtime-rules.ts,
 * which is a different, hours-calculation concern).
 */
export const NATIONAL_HOLIDAY_CATEGORY = "Hari Libur Pemerintah";

/* Supabase's dynamic table facade is intentionally untyped at this boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const DEFAULT_UMR = 2954114;
export const DEFAULT_USD_RATE = 16000;
export const DIVISIONS: Record<string, string[]> = {
  "SHED A": ["CUTTING", ...Array.from({ length: 10 }, (_, i) => `SEW L${i + 1}`), "QC", "ADM PRODUKSI", "MEKANIK"],
  "SHED B": ["CUTTING", "FINISHING", ...Array.from({ length: 10 }, (_, i) => `SEW L${i + 13}`), "SEW L14B", "QC", "ADM PRODUKSI", "MEKANIK"],
  "SHED C": ["CUTTING", "FINISHING", ...Array.from({ length: 5 }, (_, i) => `SEW L${i + 23}`), "SEW L28-32", "CNC", "QC", "ADM PRODUKSI", "MEKANIK"],
  COMMON: ["HRD & GA & DRIVER & CS & ELEKTRIK & perawat", "IE", "SAMPLE JSS", "QC COMMON", "SAMPLE OP WORKER", "SEWING COMMON", "WAREHOUSE", "PPIC & MD & EXIM", "SAMPLE OP STAFF"],
};

export type OtMapping = { id?: number; attendanceDepartment: string; shed: string; division: string; displayOrder: number };
export type OtDivision = { id?: number; shed: string; division: string; displayOrder: number };
export type OtConfigEntry = { id?: number; effectiveDate: string; umr: number; usdRate: number };

const seedMappings: OtMapping[] = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((line, i) => ({ attendanceDepartment: `SEWING LINE ${String(line).padStart(2, "0")} SHED A.`, shed: "SHED A", division: `SEW L${line}`, displayOrder: i }));

function paidHours(duration: number) { return 1.5 * Math.min(duration, 1) + 2 * Math.max(duration - 1, 0); }
function num(value: unknown) { return value == null ? 0 : Number(value) || 0; }
function chunk<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }

/** PostgREST caps unpaginated selects at 1000 rows — a single day of raw_attendance already exceeds that, so this pages through with .range() instead of trusting one request to return everything. */
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

export async function getOtPlanning(date: string, sheds: string[] = Object.keys(DIVISIONS), dateTo?: string) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const endDate = dateTo || date;
    const dateFilter = (query: any) => dateTo ? query.gte("tanggal", date).lte("tanggal", endDate) : query.eq("tanggal", date);

    const raw = await fetchAllPages<{ id: number; department: string; tanggal: string; kategori: string }>(client, "raw_attendance", "id,department,tanggal,kategori", dateFilter);
    const rawIds = raw.map((x) => Number(x.id));
    // A government-holiday day is holiday-wide (HR's rule: "tanggal 25 semuanya
    // Hari Libur Pemerintah"), so we track it both per raw row (for actual, keyed
    // by the record's own kategori) and per date (for estimates, which carry no
    // kategori of their own).
    const holidayRawIds = new Set(raw.filter((x) => String(x.kategori) === NATIONAL_HOLIDAY_CATEGORY).map((x) => Number(x.id)));
    const holidayDates = new Set(raw.filter((x) => String(x.kategori) === NATIONAL_HOLIDAY_CATEGORY).map((x) => String(x.tanggal)));
    const calculated: { raw_id: number; final_oth: number; status: string }[] = [];
    for (const idBatch of chunk(rawIds, 500)) {
      const { data, error } = await client.from("calculated_attendance").select("raw_id,final_oth,status").in("raw_id", idBatch);
      if (error) throw error;
      calculated.push(...(data ?? []));
    }

    const [{ data: estimates, error: estimateError }, { data: configs, error: configError }, { data: mappings, error: mappingError }, { data: divisions, error: divisionError }, { data: multipliers, error: multiplierError }] = await Promise.all([
      dateFilter(client.from("ot_planning_estimates").select("shed,division,duration,person,tanggal")),
      client.from("ot_planning_config_history").select("umr,usd_rate").lte("effective_date", endDate).order("effective_date", { ascending: false }).order("id", { ascending: false }).limit(1),
      client.from("ot_planning_mappings").select("id,attendance_department,shed,division,display_order").order("display_order"),
      client.from("ot_planning_divisions").select("id,shed,division,display_order").order("display_order"),
      client.from("ot_planning_duration_multipliers").select("duration,paid_hours,paid_hours_holiday").order("duration"),
    ]);
    if (estimateError) throw estimateError; if (configError) throw configError; if (mappingError) throw mappingError; if (divisionError) throw divisionError; if (multiplierError) throw multiplierError;
    const paidByDuration = new Map((multipliers ?? []).map((x: any) => [Number(x.duration), Number(x.paid_hours)]));
    const paidHolidayByDuration = new Map((multipliers ?? []).map((x: any) => [Number(x.duration), Number(x.paid_hours_holiday)]));
    const config = configs?.[0] ?? { umr: DEFAULT_UMR, usd_rate: DEFAULT_USD_RATE };
    const mappingRows: OtMapping[] = (mappings?.length ? mappings : seedMappings).map((x: any) => ({ attendanceDepartment: String(x.attendance_department ?? x.attendanceDepartment), shed: String(x.shed), division: String(x.division), displayOrder: Number(x.display_order ?? x.displayOrder ?? 0) }));
    const divisionRows = divisions?.length ? divisions.map((x: any) => ({ shed: String(x.shed), division: String(x.division), displayOrder: Number(x.display_order ?? 0) })) : Object.entries(DIVISIONS).flatMap(([shed, names]) => names.map((division, displayOrder) => ({ shed, division, displayOrder })));
    const rawById = new Map<number, string>((raw ?? []).map((x: any) => [Number(x.id), String(x.department ?? "")] as [number, string]));
    const mapByDepartment = new Map(mappingRows.map((x) => [x.attendanceDepartment.trim().toUpperCase(), x]));
    // Sesuai (clean auto-match) and Dikoreksi Manual (HR-reviewed and corrected) both count as trustworthy —
    // Tidak Sesuai/Cek Manual/Tidak Berlaku are excluded until HR resolves them. final_oth is used (not
    // system_calculated_oth) because for Dikoreksi Manual that's the corrected value HR actually approved.
    const INCLUDED_STATUSES = new Set(["Sesuai", "Dikoreksi Manual"]);
    const actual = new Map<string, number>();
    const actualHoliday = new Map<string, number>();
    for (const row of calculated ?? []) {
      if (!INCLUDED_STATUSES.has(String((row as any).status))) continue;
      const mapped = mapByDepartment.get((rawById.get(Number((row as any).raw_id)) ?? "").trim().toUpperCase());
      const duration = num((row as any).final_oth);
      if (!mapped || duration <= 0) continue;
      const key = `${mapped.shed}|${mapped.division}|${duration}`;
      const bucket = holidayRawIds.has(Number((row as any).raw_id)) ? actualHoliday : actual;
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
    const estimate = new Map<string, number>();
    const estimateHoliday = new Map<string, number>();
    for (const x of (estimates ?? []) as Array<{ shed: string; division: string; duration: number; person: number; tanggal: string }>) {
      const key = `${x.shed}|${x.division}|${num(x.duration)}`;
      const bucket = holidayDates.has(String(x.tanggal)) ? estimateHoliday : estimate;
      bucket.set(key, (bucket.get(key) ?? 0) + num(x.person));
    }
    const divisionsByShed = new Map<string, OtDivision[]>(); for (const row of divisionRows) { const list = divisionsByShed.get(row.shed) ?? []; list.push(row); divisionsByShed.set(row.shed, list); }
    return sheds.filter((x) => divisionsByShed.has(x)).map((shed) => {
      const rows = (divisionsByShed.get(shed) ?? []).sort((a, b) => a.displayOrder - b.displayOrder).map(({ division }) => {
        const prefix = `${shed}|${division}|`;
        const durations = Array.from(new Set([...actual.keys(), ...actualHoliday.keys(), ...estimate.keys(), ...estimateHoliday.keys()].filter((k) => k.startsWith(prefix)).map((k) => Number(k.split("|")[2])))).sort((a, b) => a - b);
        return { division, cells: durations.map((duration) => {
          const key = `${prefix}${duration}`;
          const est = estimate.get(key) ?? 0; const estH = estimateHoliday.get(key) ?? 0;
          const act = actual.get(key) ?? 0; const actH = actualHoliday.get(key) ?? 0;
          // A cell is priced on the holiday bracket only when every contribution
          // to it is from a government holiday. A cell that mixes holiday and
          // regular days (only possible on a multi-day range export) falls back
          // to the regular bracket rather than over-charging the regular part.
          const holiday = estH + actH > 0 && est + act === 0;
          return { duration, estimated: est + estH, actual: act + actH, holiday };
        }) };
      });
      return { shed, rows, config: { umr: num(config.umr), usdRate: num(config.usd_rate), divisor: 173, multipliers: Object.fromEntries(paidByDuration), multipliersHoliday: Object.fromEntries(paidHolidayByDuration) } };
    });
  });
}

export type OtPlanningDaySnapshot = { date: string; reports: Awaited<ReturnType<typeof getOtPlanning>> };

/**
 * One getOtPlanning(day, day) snapshot per calendar day, day 1 through `dateTo`,
 * for the Excel export's month-to-date sheets (Recap Per Day / Per Department /
 * Accounting Report) — those always show every day-so-far in the month, computed
 * fresh from the database each time (not a remembered/accumulated file), per HR's
 * explicit request that every regenerate carries the whole month's history.
 */
export async function getOtPlanningMonthToDate(dateTo: string): Promise<OtPlanningDaySnapshot[]> {
  const monthPrefix = dateTo.slice(0, 7); // YYYY-MM
  const lastDay = Number(dateTo.slice(8, 10));
  const dates = Array.from({ length: lastDay }, (_, i) => `${monthPrefix}-${String(i + 1).padStart(2, "0")}`);
  return Promise.all(dates.map(async (date) => ({ date, reports: await getOtPlanning(date) })));
}

export async function saveOtEstimates(date: string, values: Array<{ shed: string; division: string; duration: number; person: number }>) {
  return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_estimates").upsert(values.map((x) => ({ ...x, tanggal: date, updated_at: new Date().toISOString() })), { onConflict: "tanggal,shed,division,duration" }); if (error) throw error; });
}

/**
 * Full overwrite of the OT estimate rows for every date present in `values`:
 * delete all existing estimates for those dates, then insert the given rows.
 * Used by the "import estimasi OT dari Sheet2" flow — a duration cell cleared
 * in the sheet removes the corresponding estimate. Returns the row count
 * written. Dates not present in `values` are untouched.
 */
export async function replaceOtEstimatesForDates(values: Array<{ tanggal: string; shed: string; division: string; duration: number; person: number }>) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const dates = Array.from(new Set(values.map((x) => x.tanggal)));
    if (dates.length === 0) return 0;
    const { error: deleteError } = await client.from("ot_planning_estimates").delete().in("tanggal", dates);
    if (deleteError) throw deleteError;
    if (values.length === 0) return 0;
    const now = new Date().toISOString();
    const { error: insertError } = await client.from("ot_planning_estimates").insert(values.map((x) => ({ ...x, updated_at: now })));
    if (insertError) throw insertError;
    return values.length;
  });
}

export async function getOtConfigHistory(): Promise<OtConfigEntry[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("ot_planning_config_history")
      .select("id,effective_date,umr,usd_rate")
      .order("effective_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((x: any) => ({ id: Number(x.id), effectiveDate: String(x.effective_date), umr: Number(x.umr), usdRate: Number(x.usd_rate) }));
  });
}

/**
 * One UMR/USD-rate value can be effective per calendar date (effective_date
 * has a UNIQUE constraint) — getOtPlanning picks whichever entry's
 * effective_date is the latest one <= the date being calculated, so this is
 * a real history: adding a new entry for a later date doesn't touch past
 * calculations, it only takes over from its own effective_date onward.
 * Editing (value.id set) must UPDATE by primary key — upserting by the
 * natural key (effective_date) breaks the moment that key's value itself
 * changes, same reasoning as saveOtMapping/saveOtDivision below. Only a
 * fresh Add (no id) should dedupe via upsert-by-natural-key — re-saving for
 * a date that already has an entry replaces that one value rather than
 * creating an ambiguous second entry for the same date.
 */
export async function saveOtConfig(value: OtConfigEntry) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const row = { effective_date: value.effectiveDate, umr: value.umr, usd_rate: value.usdRate };
    if (value.id) {
      const { error } = await client.from("ot_planning_config_history").update(row).eq("id", value.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("ot_planning_config_history").upsert(row, { onConflict: "effective_date" });
      if (error) throw error;
    }
  });
}
export async function deleteOtConfig(id: number) {
  return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_config_history").delete().eq("id", id); if (error) throw error; });
}

export async function getOtReferences() { return supabaseGuarded(async () => { const client = getSupabaseClient(); const [{ data: mappings, error: me }, { data: divisions, error: de }, { data: multipliers, error: be }, configHistory] = await Promise.all([client.from("ot_planning_mappings").select("id,attendance_department,shed,division,display_order").order("display_order"), client.from("ot_planning_divisions").select("id,shed,division,display_order").order("display_order"), client.from("ot_planning_duration_multipliers").select("id,duration,paid_hours,paid_hours_holiday,show_in_export").order("duration"), getOtConfigHistory()]); if (me) throw me; if (de) throw de; if (be) throw be; const mappingData = (mappings?.length ? mappings : seedMappings).map((x: any) => ({ id: x.id, attendance_department: String(x.attendance_department ?? x.attendanceDepartment), shed: String(x.shed), division: String(x.division), display_order: Number(x.display_order ?? x.displayOrder ?? 0) })); const multiplierData = multipliers?.length ? multipliers.map((x: any) => ({ ...x, show_in_export: x.show_in_export ?? true })) : OT_DURATION_MULTIPLIER_SEED.map(([duration, paid_hours, paid_hours_holiday]) => ({ duration, paid_hours, paid_hours_holiday, show_in_export: duration <= 10 })); return { mappings: mappingData, divisions: divisions?.length ? divisions : Object.entries(DIVISIONS).flatMap(([shed, names]) => names.map((division, display_order) => ({ shed, division, display_order }))), multipliers: multiplierData, configHistory }; }); }

/**
 * Durations that always get a column in the Excel export even when they carry
 * no data — the `show_in_export`-checked rows of the Duration & Paid Hours
 * reference. buildOtPlanningWorkbook unions these with whatever durations
 * actually have estimated/actual values, so a checked column is always shown
 * and real data is never hidden by an unchecked box.
 */
export async function getExportDurations(): Promise<number[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("ot_planning_duration_multipliers")
      .select("duration,show_in_export")
      .order("duration");
    if (error) throw error;
    const rows = data?.length
      ? data
      : OT_DURATION_MULTIPLIER_SEED.map(([duration]) => ({ duration, show_in_export: duration <= 10 }));
    return rows.filter((x: any) => x.show_in_export ?? true).map((x: any) => Number(x.duration));
  });
}

/** Edit (value.id set) UPDATEs by primary key; a fresh Add upserts by the
 * natural key (duration) so re-adding a duration that already exists just
 * replaces its values instead of erroring on the UNIQUE(duration) constraint —
 * same pattern as saveOtMapping / saveOtDivision / saveOtConfig. */
export async function saveOtMultiplier(value: { id?: number; duration: number; paidHours: number; paidHoursHoliday: number; showInExport?: boolean }) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const row: Record<string, unknown> = { duration: value.duration, paid_hours: value.paidHours, paid_hours_holiday: value.paidHoursHoliday };
    if (value.showInExport !== undefined) row.show_in_export = value.showInExport;
    if (value.id) {
      const { error } = await client.from("ot_planning_duration_multipliers").update(row).eq("id", value.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("ot_planning_duration_multipliers").upsert(row, { onConflict: "duration" });
      if (error) throw error;
    }
  });
}
export async function deleteOtMultiplier(id: number) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_duration_multipliers").delete().eq("id", id); if (error) throw error; }); }

/**
 * Report Time Overdue "Setup" tab (app/(app)/reports/employee) — lists every
 * known OT duration alongside whether it's checked as a Time Overdue filter.
 * Reuses the same duration master list as the OT Planning Export checkboxes
 * (`show_in_export`), but `time_overdue_filter` is a separate, independent
 * flag: checking a duration here restricts getTimeOverdueReport to only
 * attendance rows whose FINAL OTH equals a checked duration. No durations
 * checked = report shows everything, same as before this feature existed.
 */
export async function getTimeOverdueFilterDurations(): Promise<{ duration: number; timeOverdueFilter: boolean }[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("ot_planning_duration_multipliers")
      .select("duration,time_overdue_filter")
      .order("duration");
    if (error) throw error;
    const rows = data?.length
      ? data
      : OT_DURATION_MULTIPLIER_SEED.map(([duration]) => ({ duration, time_overdue_filter: false }));
    return rows.map((x: any) => ({ duration: Number(x.duration), timeOverdueFilter: !!x.time_overdue_filter }));
  });
}

/** Toggles the Time Overdue filter checkbox for one duration (matched by the duration value itself, not id — every duration in OT_DURATION_MULTIPLIER_SEED already has a row from the init-time backfill). */
export async function setTimeOverdueFilterDuration(duration: number, timeOverdueFilter: boolean) {
  return supabaseGuarded(async () => {
    const { error } = await getSupabaseClient()
      .from("ot_planning_duration_multipliers")
      .update({ time_overdue_filter: timeOverdueFilter })
      .eq("duration", duration);
    if (error) throw error;
  });
}
/** Editing (value.id set) must UPDATE by primary key — upserting by the natural key (attendance_department) breaks the moment that key's value itself changes, since the row then no longer matches the ON CONFLICT target and Postgres falls through to a plain INSERT carrying the old id, colliding with the primary key. Only a fresh Add (no id) should dedupe via upsert-by-natural-key. */
export async function saveOtMapping(value: OtMapping) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const row = { attendance_department: value.attendanceDepartment, shed: value.shed, division: value.division, display_order: value.displayOrder };
    if (value.id) {
      const { error } = await client.from("ot_planning_mappings").update(row).eq("id", value.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("ot_planning_mappings").upsert(row, { onConflict: "attendance_department" });
      if (error) throw error;
    }
  });
}
export async function deleteOtMapping(id: number) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_mappings").delete().eq("id", id); if (error) throw error; }); }
/** Same reasoning as saveOtMapping: edit (id set) must UPDATE by primary key, not upsert-by-(shed,division) — renaming the division changes the natural key the ON CONFLICT target relies on. */
export async function saveOtDivision(value: OtDivision) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const row = { shed: value.shed, division: value.division, display_order: value.displayOrder };
    if (value.id) {
      const { error } = await client.from("ot_planning_divisions").update(row).eq("id", value.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("ot_planning_divisions").upsert(row, { onConflict: "shed,division" });
      if (error) throw error;
    }
  });
}
export async function deleteOtDivision(id: number) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_divisions").delete().eq("id", id); if (error) throw error; }); }

export { paidHours };
