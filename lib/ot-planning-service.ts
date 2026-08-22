import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";

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

const seedMappings: OtMapping[] = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((line, i) => ({ attendanceDepartment: `SEWING LINE ${String(line).padStart(2, "0")} SHED A.`, shed: "SHED A", division: `SEW L${line}`, displayOrder: i }));

function paidHours(duration: number) { return 1.5 * Math.min(duration, 1) + 2 * Math.max(duration - 1, 0); }
function num(value: unknown) { return value == null ? 0 : Number(value) || 0; }

export async function getOtPlanning(date: string, sheds: string[] = Object.keys(DIVISIONS)) {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const [{ data: raw, error: rawError }, { data: calculated, error: calculatedError }, { data: estimates, error: estimateError }, { data: configs, error: configError }, { data: mappings, error: mappingError }, { data: divisions, error: divisionError }, { data: multipliers, error: multiplierError }] = await Promise.all([
      client.from("raw_attendance").select("id,department").eq("tanggal", date),
      client.from("calculated_attendance").select("raw_id,system_calculated_oth,status"),
      client.from("ot_planning_estimates").select("shed,division,duration,person").eq("tanggal", date),
      client.from("ot_planning_config_history").select("umr,usd_rate").lte("effective_date", date).order("effective_date", { ascending: false }).limit(1),
      client.from("ot_planning_mappings").select("id,attendance_department,shed,division,display_order").order("display_order"),
      client.from("ot_planning_divisions").select("id,shed,division,display_order").order("display_order"),
      client.from("ot_planning_duration_multipliers").select("duration,paid_hours").order("duration"),
    ]);
    if (rawError) throw rawError; if (calculatedError) throw calculatedError; if (estimateError) throw estimateError; if (configError) throw configError; if (mappingError) throw mappingError; if (divisionError) throw divisionError; if (multiplierError) throw multiplierError;
    const paidByDuration = new Map((multipliers ?? []).map((x: any) => [Number(x.duration), Number(x.paid_hours)]));
    const config = configs?.[0] ?? { umr: DEFAULT_UMR, usd_rate: DEFAULT_USD_RATE };
    const mappingRows: OtMapping[] = (mappings?.length ? mappings : seedMappings).map((x: any) => ({ attendanceDepartment: String(x.attendance_department ?? x.attendanceDepartment), shed: String(x.shed), division: String(x.division), displayOrder: Number(x.display_order ?? x.displayOrder ?? 0) }));
    const divisionRows = divisions?.length ? divisions.map((x: any) => ({ shed: String(x.shed), division: String(x.division), displayOrder: Number(x.display_order ?? 0) })) : Object.entries(DIVISIONS).flatMap(([shed, names]) => names.map((division, displayOrder) => ({ shed, division, displayOrder })));
    const rawById = new Map<number, string>((raw ?? []).map((x: any) => [Number(x.id), String(x.department ?? "")] as [number, string]));
    const mapByDepartment = new Map(mappingRows.map((x) => [x.attendanceDepartment.trim().toUpperCase(), x]));
    const actual = new Map<string, number>();
    for (const row of calculated ?? []) { if (String((row as any).status) !== "Sesuai") continue; const mapped = mapByDepartment.get((rawById.get(Number((row as any).raw_id)) ?? "").trim().toUpperCase()); const duration = num((row as any).system_calculated_oth); if (mapped && duration > 0) actual.set(`${mapped.shed}|${mapped.division}|${duration}`, (actual.get(`${mapped.shed}|${mapped.division}|${duration}`) ?? 0) + 1); }
    const estimateRows = (estimates ?? []) as Array<{ shed: string; division: string; duration: number; person: number }>;
    const estimate = new Map<string, number>(estimateRows.map((x) => [`${x.shed}|${x.division}|${num(x.duration)}`, num(x.person)]));
    const divisionsByShed = new Map<string, OtDivision[]>(); for (const row of divisionRows) { const list = divisionsByShed.get(row.shed) ?? []; list.push(row); divisionsByShed.set(row.shed, list); }
    return sheds.filter((x) => divisionsByShed.has(x)).map((shed) => {
      const rows = (divisionsByShed.get(shed) ?? []).sort((a, b) => a.displayOrder - b.displayOrder).map(({ division }) => {
        const durations = Array.from(new Set([...actual.keys(), ...estimate.keys()].filter((k) => k.startsWith(`${shed}|${division}|`)).map((k) => Number(k.split("|")[2])))).sort((a, b) => a - b);
        return { division, cells: durations.map((duration) => ({ duration, estimated: estimate.get(`${shed}|${division}|${duration}`) ?? 0, actual: actual.get(`${shed}|${division}|${duration}`) ?? 0 })) };
      });
      return { shed, rows, config: { umr: num(config.umr), usdRate: num(config.usd_rate), divisor: 173, multipliers: Object.fromEntries(paidByDuration) } };
    });
  });
}

export async function saveOtEstimates(date: string, values: Array<{ shed: string; division: string; duration: number; person: number }>) {
  return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_estimates").upsert(values.map((x) => ({ ...x, tanggal: date, updated_at: new Date().toISOString() })), { onConflict: "tanggal,shed,division,duration" }); if (error) throw error; });
}

export async function saveOtConfig(effectiveDate: string, umr: number, usdRate: number) {
  return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_config_history").insert({ effective_date: effectiveDate, umr, usd_rate: usdRate }); if (error) throw error; });
}

export async function getOtReferences() { return supabaseGuarded(async () => { const client = getSupabaseClient(); const [{ data: mappings, error: me }, { data: divisions, error: de }, { data: multipliers, error: be }] = await Promise.all([client.from("ot_planning_mappings").select("id,attendance_department,shed,division,display_order").order("display_order"), client.from("ot_planning_divisions").select("id,shed,division,display_order").order("display_order"), client.from("ot_planning_duration_multipliers").select("id,duration,paid_hours").order("duration")]); if (me) throw me; if (de) throw de; if (be) throw be; const mappingData = (mappings?.length ? mappings : seedMappings).map((x: any) => ({ id: x.id, attendance_department: String(x.attendance_department ?? x.attendanceDepartment), shed: String(x.shed), division: String(x.division), display_order: Number(x.display_order ?? x.displayOrder ?? 0) })); const multiplierData = multipliers?.length ? multipliers : Array.from({ length: 26 }, (_, i) => ({ duration: (i + 1) / 2, paid_hours: paidHours((i + 1) / 2) })); return { mappings: mappingData, divisions: divisions?.length ? divisions : Object.entries(DIVISIONS).flatMap(([shed, names]) => names.map((division, display_order) => ({ shed, division, display_order }))), multipliers: multiplierData }; }); }
export async function saveOtMapping(value: OtMapping) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_mappings").upsert({ ...(value.id ? { id: value.id } : {}), attendance_department: value.attendanceDepartment, shed: value.shed, division: value.division, display_order: value.displayOrder }, { onConflict: "attendance_department" }); if (error) throw error; }); }
export async function deleteOtMapping(id: number) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_mappings").delete().eq("id", id); if (error) throw error; }); }
export async function saveOtDivision(value: OtDivision) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_divisions").upsert({ ...(value.id ? { id: value.id } : {}), shed: value.shed, division: value.division, display_order: value.displayOrder }, { onConflict: "shed,division" }); if (error) throw error; }); }
export async function deleteOtDivision(id: number) { return supabaseGuarded(async () => { const { error } = await getSupabaseClient().from("ot_planning_divisions").delete().eq("id", id); if (error) throw error; }); }

export { paidHours };
