import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { getOtReferences } from "@/lib/ot-planning-service";

/* Supabase's dynamic table facade is intentionally untyped at this boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "Report Time Overdue" — a clock-in discipline report ("Cluster Tertib"),
 * distinct from the OT Planning report even though it shares the same
 * department -> Unit mapping. Measures how many minutes the fingerprint
 * machine's actual IT1 clock-in lags the scheduled InTime, bucketed into
 * three tiers, per Unit. IT1 <= InTime (arrived on time or early) counts as
 * Normal, same as the 0:00 - 0:15 bucket.
 */

export type TimeOverdueBucket = "0:00 - 0:15" | "0:16 - 0:20" | "> 0:21 Minute";
export const TIME_OVERDUE_BUCKETS: TimeOverdueBucket[] = ["0:00 - 0:15", "0:16 - 0:20", "> 0:21 Minute"];

export interface TimeOverdueUnitRow { shed: string; division: string; counts: Record<TimeOverdueBucket, number>; total: number }
export interface TimeOverdueDetailRow {
  nik: string;
  name: string;
  department: string;
  shed: string;
  division: string;
  tanggal: string;
  intime: string;
  outtime: string;
  it1: string;
  ot1: string;
  selisihMinutes: number;
}
export interface TimeOverdueReport {
  units: TimeOverdueUnitRow[];
  detail: Record<TimeOverdueBucket, TimeOverdueDetailRow[]>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** PostgREST caps unpaginated selects at 1000 rows — pages through with .range() instead of trusting one request to return everything (same fix as getOtPlanning). */
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

function timeToMinutes(value: unknown): number | null {
  const str = String(value ?? "").trim();
  const match = str.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function bucketOf(selisihMinutes: number): TimeOverdueBucket {
  if (selisihMinutes <= 15) return "0:00 - 0:15";
  if (selisihMinutes <= 20) return "0:16 - 0:20";
  return "> 0:21 Minute";
}

export async function getTimeOverdueReport(date: string, dateTo?: string): Promise<TimeOverdueReport> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const endDate = dateTo || date;
    const dateFilter = (query: any) => (dateTo ? query.gte("tanggal", date).lte("tanggal", endDate) : query.eq("tanggal", date));

    const raw = await fetchAllPages<{ id: number; nik: string; nama: string; department: string; tanggal: string; it1: string | null; intime: string | null; outtime: string | null; ot1: string | null }>(
      client, "raw_attendance", "id,nik,nama,department,tanggal,it1,intime,outtime,ot1", dateFilter,
    );
    const rawIds = raw.map((x) => Number(x.id));
    const validRawIds = new Set<number>();
    for (const idBatch of chunk(rawIds, 500)) {
      const { data, error } = await client.from("calculated_attendance").select("raw_id,status").in("raw_id", idBatch);
      if (error) throw error;
      // Sesuai (clean auto-match) and Dikoreksi Manual (HR-reviewed and corrected) both count — Tidak
      // Sesuai/Cek Manual/Tidak Berlaku are excluded until HR resolves them (same rule as getOtPlanning).
      for (const row of (data ?? []) as { raw_id: number; status: string }[]) {
        if (row.status === "Sesuai" || row.status === "Dikoreksi Manual") validRawIds.add(Number(row.raw_id));
      }
    }

    const { mappings, divisions } = await getOtReferences();
    const mapByDepartment = new Map<string, { shed: string; division: string }>(
      mappings.map((x: any) => [String(x.attendance_department).trim().toUpperCase(), { shed: String(x.shed), division: String(x.division) }]),
    );

    const counts = new Map<string, Record<TimeOverdueBucket, number>>();
    const detail: Record<TimeOverdueBucket, TimeOverdueDetailRow[]> = { "0:00 - 0:15": [], "0:16 - 0:20": [], "> 0:21 Minute": [] };

    for (const row of raw) {
      if (!validRawIds.has(Number(row.id))) continue;
      const unit = mapByDepartment.get(String(row.department).trim().toUpperCase());
      if (!unit) continue;
      const inMinutes = timeToMinutes(row.intime);
      const it1Minutes = timeToMinutes(row.it1);
      if (inMinutes === null || it1Minutes === null) continue;

      // IT1 < InTime (arrived before the scheduled time) is Normal — falls into the same bucket as a 0-minute lag.
      const selisihMinutes = Math.max(0, it1Minutes - inMinutes);
      const bucket = bucketOf(selisihMinutes);
      const key = `${unit.shed}|${unit.division}`;
      const current = counts.get(key) ?? { "0:00 - 0:15": 0, "0:16 - 0:20": 0, "> 0:21 Minute": 0 };
      current[bucket] += 1;
      counts.set(key, current);

      detail[bucket].push({
        nik: String(row.nik ?? ""),
        name: String(row.nama ?? ""),
        department: String(row.department ?? ""),
        shed: unit.shed,
        division: unit.division,
        tanggal: String(row.tanggal ?? ""),
        intime: String(row.intime ?? ""),
        outtime: String(row.outtime ?? ""),
        it1: String(row.it1 ?? ""),
        ot1: String(row.ot1 ?? ""),
        selisihMinutes,
      });
    }

    const units: TimeOverdueUnitRow[] = (divisions as any[]).map((d) => {
      const key = `${d.shed}|${d.division}`;
      const c = counts.get(key) ?? { "0:00 - 0:15": 0, "0:16 - 0:20": 0, "> 0:21 Minute": 0 };
      const total = c["0:00 - 0:15"] + c["0:16 - 0:20"] + c["> 0:21 Minute"];
      return { shed: String(d.shed), division: String(d.division), counts: c, total };
    });

    return { units, detail };
  });
}
