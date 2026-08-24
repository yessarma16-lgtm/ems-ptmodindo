"use client";

/* The reference editor receives dynamic rows from the API facade. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarCheck, FileSpreadsheet, FileText, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { toast } from "sonner";

type Cell = { duration: number; estimated: number; actual: number };
type Report = { shed: string; config: { umr: number; usdRate: number; divisor: number; multipliers?: Record<string, number> }; rows: { division: string; cells: Cell[] }[] };
type Mapping = { id?: number; attendance_department: string; shed: string; division: string; display_order: number };
type Division = { id?: number; shed: string; division: string; display_order: number };
const DEPARTMENTS = ["SHED A", "SHED B", "SHED C", "COMMON"];
const money = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
const paidHours = (d: number) => 1.5 * Math.min(d, 1) + 2 * Math.max(d - 1, 0);

export default function OtPlanningPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<"report" | "reference">("report");
  const [dateFrom, setDateFrom] = useState(today); const [dateTo, setDateTo] = useState(today);
  const [sheds, setSheds] = useState(DEPARTMENTS); const [data, setData] = useState<Report[]>([]); const [loading, setLoading] = useState(false);
  const [processedDates, setProcessedDates] = useState<string[]>([]); const [umr, setUmr] = useState(2954114); const [usdRate, setUsdRate] = useState(16000);
  const [mappings, setMappings] = useState<Mapping[]>([]); const [divisions, setDivisions] = useState<Division[]>([]); const [multipliers, setMultipliers] = useState<{ duration: number; paid_hours: number }[]>([]);
  const allSelected = sheds.length === DEPARTMENTS.length;
  async function load() { if (!dateFrom || !dateTo || dateFrom > dateTo) return; setLoading(true); try { const q = new URLSearchParams({ dateFrom, dateTo }); sheds.forEach((s) => q.append("shed", s)); const r = await fetch(`/api/reports/ot-planning?${q}`, { cache: "no-store" }); if (!r.ok) throw new Error("Failed to load report."); const v = await r.json(); setData(v); if (v[0]) { setUmr(v[0].config.umr); setUsdRate(v[0].config.usdRate); } } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load report."); } finally { setLoading(false); } }
  async function loadReferences() { const r = await fetch("/api/reports/ot-planning?references=1", { cache: "no-store" }); if (r.ok) { const v = await r.json(); setMappings(v.mappings ?? []); setDivisions(v.divisions ?? []); setMultipliers(v.multipliers ?? []); } }
  useEffect(() => { fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined); }, []);
  useEffect(() => { const timeoutId = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timeoutId); }, [dateFrom, dateTo, sheds]);
  useEffect(() => { if (tab !== "reference") return; const timeoutId = window.setTimeout(() => { void loadReferences(); }, 0); return () => window.clearTimeout(timeoutId); }, [tab]);
  const toggleShed = (shed: string, checked: boolean) => setSheds((current) => checked ? Array.from(new Set([...current, shed])) : current.filter((x) => x !== shed));
  const exportQuery = () => { const q = new URLSearchParams({ dateFrom, dateTo }); sheds.forEach((s) => q.append("shed", s)); if (allSelected) q.set("summary", "1"); return q.toString(); };
  const save = async () => { const values = data.flatMap((g) => g.rows.flatMap((r) => r.cells.map((c) => ({ shed: g.shed, division: r.division, duration: c.duration, person: c.estimated })))); const res = await fetch("/api/reports/ot-planning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dateFrom, values }) }); if (!res.ok) { toast.error("Failed to save estimates."); return; } toast.success("Estimates saved."); };
  const update = (shed: string, division: string, duration: number, person: number) => setData((old) => old.map((g) => g.shed !== shed ? g : { ...g, rows: g.rows.map((r) => r.division !== division ? r : { ...r, cells: r.cells.map((c) => c.duration === duration ? { ...c, estimated: person } : c) }) }));
  const post = async (body: unknown) => { const r = await fetch("/api/reports/ot-planning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed to save reference."); await loadReferences(); toast.success("Reference saved."); };
  return <div className="space-y-5"><PageHeader title="OT Planning" description="Overtime planning and budget realization by department." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }, { label: "OT Planning" }]} /><div className="flex gap-2"><Button variant={tab === "report" ? "default" : "outline"} onClick={() => setTab("report")}>OT Planning Report</Button><Button variant={tab === "reference" ? "default" : "outline"} onClick={() => setTab("reference")}>Reference</Button></div>{tab === "reference" ? <References mappings={mappings} divisions={divisions} multipliers={multipliers} umr={umr} usdRate={usdRate} setUmr={setUmr} setUsdRate={setUsdRate} date={dateFrom} post={post} /> : <><Card><CardContent className="pt-6"><h2 className="mb-4 text-lg font-semibold">Selected Report</h2><div className="flex flex-wrap items-end gap-5"><div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={setDateFrom} processedDates={processedDates} /></div><div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={setDateTo} processedDates={processedDates} /></div><div className="flex flex-wrap gap-4 pb-2"><label className="flex items-center gap-2 text-sm"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSheds(checked ? DEPARTMENTS : [])} />All Departments</label>{DEPARTMENTS.map((shed) => <label className="flex items-center gap-2 text-sm" key={shed}><Checkbox checked={sheds.includes(shed)} onCheckedChange={(checked) => toggleShed(shed, checked === true)} />{shed}</label>)}</div><div className="ml-auto flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-1.5 shadow-sm"><Button className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" size="sm" title="Save estimates" aria-label="Save estimates" onClick={() => void save()} disabled={loading}><Save className="size-4" /><span className="hidden sm:inline">Save</span></Button><Button className="bg-sky-600 text-white shadow-sm hover:bg-sky-700" size="sm" title="Export Excel" aria-label="Export Excel" onClick={() => window.open(`/api/reports/ot-planning/export?${exportQuery()}`, "_blank")}><FileSpreadsheet className="size-4" /><span className="hidden sm:inline">Excel</span></Button><Button className="bg-rose-600 text-white shadow-sm hover:bg-rose-700" size="sm" title="Export PDF" aria-label="Export PDF" onClick={() => window.open(`/api/reports/ot-planning/pdf?${exportQuery()}`, "_blank")}><FileText className="size-4" /><span className="hidden sm:inline">PDF</span></Button></div></div><p className="mt-3 text-xs text-muted-foreground"><CalendarCheck className="mr-1 inline size-3" />Green ring indicates a date with completed MPP Calculation.</p></CardContent></Card><div><h2 className="mb-3 text-lg font-semibold">Report Preview</h2>{loading ? <p>Loading...</p> : data.length ? data.map((g) => <ReportTable key={g.shed} group={g} update={update} />) : <p className="text-sm text-muted-foreground">No report data for the selected filters.</p>}</div></>}</div>;
}

function ReportTable({ group, update }: { group: Report; update: (shed: string, division: string, duration: number, person: number) => void }) {
  const durations = useMemo(() => Array.from(new Set(group.rows.flatMap((r) => r.cells.map((c) => c.duration)))).sort((a, b) => a - b), [group]);
  const rate = (d: number) => group.config.umr / group.config.divisor * (group.config.multipliers?.[String(d)] ?? paidHours(d));
  const totals = durations.map((duration) => group.rows.reduce((total, row) => {
    const cell = row.cells.find((item) => item.duration === duration);
    return { estimated: total.estimated + (cell?.estimated ?? 0), actual: total.actual + (cell?.actual ?? 0) };
  }, { estimated: 0, actual: 0 }));
  const totalEstimatedIdr = totals.reduce((sum, total, index) => sum + total.estimated * rate(durations[index]), 0);
  const totalActualIdr = totals.reduce((sum, total, index) => sum + total.actual * rate(durations[index]), 0);
  return <Card className="mb-5 overflow-auto"><CardContent className="pt-6"><h3 className="mb-3 text-base font-semibold">{group.shed}</h3><table className="w-full min-w-[1000px] border-collapse text-sm"><thead><tr className="bg-muted"><th className="border p-2 text-left">Division</th>{durations.map((d) => <th colSpan={4} className="border p-2" key={d}>{d} hours<br /><span className="font-normal">Estimated People / IDR · Actual People / IDR</span></th>)}<th className="border p-2">Total Estimated IDR</th><th className="border p-2">Total Actual IDR</th></tr></thead><tbody>{group.rows.map((row) => <tr key={row.division}><td className="border p-2 font-medium">{row.division}</td>{durations.map((d) => { const c = row.cells.find((x) => x.duration === d) ?? { duration: d, estimated: 0, actual: 0 }; return <>{<td className="border p-1"><Input className="h-8 w-16" type="number" min="0" value={c.estimated} onChange={(e) => update(group.shed, row.division, d, Number(e.target.value))} /></td>}<td className="border p-1">{money(c.estimated * rate(d))}</td><td className="border p-1">{c.actual}</td><td className="border p-1">{money(c.actual * rate(d))}</td></>; })}<td className="border p-2">{money(row.cells.reduce((s, c) => s + c.estimated * rate(c.duration), 0))}</td><td className="border p-2">{money(row.cells.reduce((s, c) => s + c.actual * rate(c.duration), 0))}</td></tr>)}</tbody><tfoot><tr className="bg-primary/10 font-bold"><td className="border p-2">TOTAL {group.shed}</td>{totals.map((total, index) => <Fragment key={durations[index]}><td className="border p-2">{money(total.estimated)}</td><td className="border p-2">{money(total.estimated * rate(durations[index]))}</td><td className="border p-2">{money(total.actual)}</td><td className="border p-2">{money(total.actual * rate(durations[index]))}</td></Fragment>)}<td className="border p-2">{money(totalEstimatedIdr)}</td><td className="border p-2">{money(totalActualIdr)}</td></tr></tfoot></table></CardContent></Card>;
}

function groupByShed<T extends { shed: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const list = groups.get(row.shed) ?? []; list.push(row); groups.set(row.shed, list); }
  const order = [...SHED_ORDER, ...Array.from(groups.keys()).filter((s) => !SHED_ORDER.includes(s))];
  return order.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!]);
}
const SHED_ORDER = ["SHED A", "SHED B", "SHED C", "COMMON"];

function References({ mappings, divisions, multipliers, umr, usdRate, setUmr, setUsdRate, date, post }: any) {
  const [m, setM] = useState({ attendanceDepartment: "", shed: "SHED A", division: "", displayOrder: 0 });
  const [d, setD] = useState({ shed: "SHED A", division: "", displayOrder: 0 });
  const mappingGroups = useMemo(() => groupByShed(mappings as Mapping[]), [mappings]);
  const divisionGroups = useMemo(() => groupByShed(divisions as Division[]), [divisions]);
  return <div className="grid gap-5">
    <Card><CardContent className="grid max-w-xl gap-4 pt-6"><label>UMR (IDR)<Input type="number" value={umr} onChange={(e) => setUmr(Number(e.target.value))} /></label><label>USD Rate (IDR)<Input type="number" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))} /></label><p className="text-xs text-muted-foreground">Effective snapshot for {date}. Divisor is fixed at 173.</p><Button onClick={() => void post({ kind: "config", effectiveDate: date, umr, usdRate })}>Save Reference</Button></CardContent></Card>
    <Card><CardContent className="pt-6"><h2 className="mb-3 font-semibold">Duration & Paid Hours</h2><div className="grid grid-cols-2 gap-2 text-sm">{multipliers.map((x: any) => <div className="border-b p-1" key={x.duration}>{x.duration} hours → {x.paid_hours} paid hours</div>)}</div></CardContent></Card>
    <Card><CardContent className="pt-6">
      <h2 className="mb-3 font-semibold">Department Mapping</h2>
      <div className="mb-4 flex gap-2"><Input placeholder="Attendance department" value={m.attendanceDepartment} onChange={(e) => setM({ ...m, attendanceDepartment: e.target.value })} /><Input placeholder="Shed" value={m.shed} onChange={(e) => setM({ ...m, shed: e.target.value })} /><Input placeholder="Division" value={m.division} onChange={(e) => setM({ ...m, division: e.target.value })} /><Button onClick={() => void post({ kind: "mapping", value: m })}>Add</Button></div>
      <div className="grid gap-5">
        {mappingGroups.map(([shed, rows]) => <div key={shed}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{shed}</h3>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-muted"><th className="border p-2 text-left">Attendance Department</th><th className="border p-2 text-left">Division</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.id}><td className="border p-2">{x.attendance_department}</td><td className="border p-2">{x.division}</td></tr>)}</tbody>
          </table>
        </div>)}
      </div>
    </CardContent></Card>
    <Card><CardContent className="pt-6">
      <h2 className="mb-3 font-semibold">Divisions by Shed</h2>
      <div className="mb-4 flex gap-2"><Input placeholder="Shed" value={d.shed} onChange={(e) => setD({ ...d, shed: e.target.value })} /><Input placeholder="Division" value={d.division} onChange={(e) => setD({ ...d, division: e.target.value })} /><Button onClick={() => void post({ kind: "division", value: d })}>Add</Button></div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {divisionGroups.map(([shed, rows]) => <div key={shed}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{shed}</h3>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-muted"><th className="border p-2 text-left">Division</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.id}><td className="border p-2">{x.division}</td></tr>)}</tbody>
          </table>
        </div>)}
      </div>
    </CardContent></Card>
  </div>;
}
