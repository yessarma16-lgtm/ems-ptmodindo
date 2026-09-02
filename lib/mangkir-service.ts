import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { getOtReferences } from "@/lib/ot-planning-service";
import { getSettingValue, setSettingValue } from "@/lib/database/postgres-settings";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "Report Mangkir" — flags Active employees with N or more consecutive
 * SCHEDULED WORK DAYS of unauthorized absence (raw_attendance.kategori ===
 * "Mangkir"), not merely blank IT1/OT1 — a blank clock time also shows up on
 * approved leave (Cuti, Ijin, Cuti Melahirkan, ...) and national holidays,
 * none of which are "Mangkir" and must NOT count toward or break a streak the
 * same way.
 *
 * "Scheduled work day" excludes MANGKIR_OFF_DAY_CATEGORIES (weekly off /
 * national holiday) — those days are skipped entirely (neither extend nor
 * break a streak). Every other kategori (Normal, Cuti, Ijin, Cuti Melahirkan,
 * Dinas Perusahaan, the data-quality "Error!!" category, etc.) breaks the
 * streak — the employee demonstrably wasn't "gone without a trace" that day,
 * or the data is too ambiguous to accuse them on. A streak can span month
 * boundaries — rows are walked in chronological order across the whole
 * fetched range, never reset at month start.
 */

const MANGKIR_KATEGORI = "Mangkir";
const MANGKIR_OFF_DAY_CATEGORIES = new Set(["Hari Libur Pemerintah", "Hari Libur/Minggu"]);

const MANGKIR_THRESHOLD_KEY = "mangkir_consecutive_threshold";
const DEFAULT_THRESHOLD = 3;

/** Report Mangkir "Setup" — how many consecutive work days of Mangkir before an employee is flagged. Defaults to 3. */
export async function getMangkirThreshold(): Promise<number> {
  const raw = await getSettingValue(MANGKIR_THRESHOLD_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_THRESHOLD;
}

export async function setMangkirThreshold(value: number): Promise<void> {
  await setSettingValue(
    MANGKIR_THRESHOLD_KEY,
    String(Math.max(1, Math.floor(value))),
    "Report Mangkir: jumlah hari kerja Mangkir berturut-turut sebelum karyawan di-flag.",
  );
}

export interface MangkirEmployee {
  recordId: string;
  nik: string;
  name: string;
  department: string;
  shed: string;
  division: string;
  /** Chronological dates of the longest Mangkir run found in the requested range. */
  streakDates: string[];
  streakLength: number;
}

export interface MangkirReport {
  threshold: number;
  employees: MangkirEmployee[];
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

export async function getMangkirReport(dateFrom: string, dateTo: string): Promise<MangkirReport> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const threshold = await getMangkirThreshold();

    type RawRow = { nik: string; nama: string; department: string; tanggal: string; kategori: string | null };
    const raw = await fetchAllPages<RawRow>(
      client, "raw_attendance", "nik,nama,department,tanggal,kategori",
      (q: any) => q.gte("tanggal", dateFrom).lte("tanggal", dateTo).order("tanggal", { ascending: true }),
    );

    const niks = Array.from(new Set(raw.map((r) => r.nik)));
    const employeeByNik = new Map<string, { recordId: string; status: string }>();
    for (const idBatch of chunk(niks, 500)) {
      const { data, error } = await client.from("employees").select("record_id,nik,status").in("nik", idBatch);
      if (error) throw error;
      for (const e of (data ?? []) as { record_id: string; nik: string; status: string }[]) {
        employeeByNik.set(e.nik, { recordId: e.record_id, status: e.status });
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

    const employees: MangkirEmployee[] = [];
    for (const [nik, rows] of rowsByNik) {
      const emp = employeeByNik.get(nik);
      if (!emp || emp.status.trim().toLowerCase() !== "active") continue;

      let streak: string[] = [];
      let maxStreak: string[] = [];
      for (const row of rows) {
        const kategori = String(row.kategori ?? "").trim();
        if (MANGKIR_OFF_DAY_CATEGORIES.has(kategori)) continue; // neutral day — neither extends nor breaks the streak
        if (kategori === MANGKIR_KATEGORI) {
          streak = [...streak, row.tanggal];
          if (streak.length > maxStreak.length) maxStreak = streak;
        } else {
          streak = [];
        }
      }

      if (maxStreak.length >= threshold) {
        const latest = rows[rows.length - 1];
        const unit = mapByDepartment.get(String(latest.department).trim().toUpperCase());
        employees.push({
          recordId: emp.recordId,
          nik,
          name: String(latest.nama ?? ""),
          department: String(latest.department ?? ""),
          shed: unit?.shed ?? "",
          division: unit?.division ?? "",
          streakDates: maxStreak,
          streakLength: maxStreak.length,
        });
      }
    }

    employees.sort((a, b) => b.streakLength - a.streakLength || a.name.localeCompare(b.name));
    return { threshold, employees };
  });
}
