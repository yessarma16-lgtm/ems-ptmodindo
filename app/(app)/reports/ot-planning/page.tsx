"use client";

/* The reference editor receives dynamic rows from the API facade. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import Image from "next/image";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarCheck, ChevronDown, GripVertical, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { toast } from "sonner";

type Cell = { duration: number; estimated: number; actual: number; holiday?: boolean };
type Report = { shed: string; config: { umr: number; usdRate: number; divisor: number; multipliers?: Record<string, number>; multipliersHoliday?: Record<string, number> }; rows: { division: string; cells: Cell[] }[] };
type Multiplier = { id?: number; duration: number; paid_hours: number; paid_hours_holiday: number; show_in_export?: boolean | number };
type Mapping = { id?: number; attendance_department: string; shed: string; division: string; display_order: number };
type Division = { id?: number; shed: string; division: string; display_order: number };
type ConfigEntry = { id?: number; effectiveDate: string; umr: number; usdRate: number };
const DEPARTMENTS = ["SHED A", "SHED B", "SHED C", "COMMON"];
const money = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
const paidHours = (d: number) => 1.5 * Math.min(d, 1) + 2 * Math.max(d - 1, 0);

function ExportImageIcon({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={32} height={32} className="size-8 object-contain" />;
}

export default function OtPlanningPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<"report" | "reference">("report");
  const [dateFrom, setDateFrom] = useState(today); const [dateTo, setDateTo] = useState(today);
  const [sheds, setSheds] = useState(DEPARTMENTS); const [data, setData] = useState<Report[]>([]); const [loading, setLoading] = useState(false);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]); const [divisions, setDivisions] = useState<Division[]>([]); const [multipliers, setMultipliers] = useState<Multiplier[]>([]);
  const [configHistory, setConfigHistory] = useState<ConfigEntry[]>([]);
  const [allSelected, setAllSelected] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  async function load() { if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; } setHasRun(true); setLoading(true); try { const q = new URLSearchParams({ dateFrom, dateTo }); sheds.forEach((s) => q.append("shed", s)); const r = await fetch(`/api/reports/ot-planning?${q}`, { cache: "no-store" }); if (!r.ok) throw new Error("Failed to load report."); const v = await r.json(); setData(v); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load report."); } finally { setLoading(false); } }
  async function loadReferences() { const r = await fetch("/api/reports/ot-planning?references=1", { cache: "no-store" }); if (r.ok) { const v = await r.json(); setMappings(v.mappings ?? []); setDivisions(v.divisions ?? []); setMultipliers(v.multipliers ?? []); setConfigHistory(v.configHistory ?? []); } }
  useEffect(() => { fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined); }, []);
  useEffect(() => { if (tab !== "reference") return; const timeoutId = window.setTimeout(() => { void loadReferences(); }, 0); return () => window.clearTimeout(timeoutId); }, [tab]);
  const toggleShed = (shed: string, checked: boolean) => setSheds((current) => checked ? Array.from(new Set([...current, shed])) : current.filter((x) => x !== shed));
  const exportQuery = () => { const q = new URLSearchParams({ dateFrom, dateTo }); sheds.forEach((s) => q.append("shed", s)); return q.toString(); };
  const save = async () => { const values = data.flatMap((g) => g.rows.flatMap((r) => r.cells.map((c) => ({ shed: g.shed, division: r.division, duration: c.duration, person: c.estimated })))); const res = await fetch("/api/reports/ot-planning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dateFrom, values }) }); if (!res.ok) { toast.error("Failed to save estimates."); return; } toast.success("Estimates saved."); };
  const update = (shed: string, division: string, duration: number, person: number) => setData((old) => old.map((g) => g.shed !== shed ? g : { ...g, rows: g.rows.map((r) => r.division !== division ? r : { ...r, cells: r.cells.map((c) => c.duration === duration ? { ...c, estimated: person } : c) }) }));
  const post = async (body: unknown) => { try { const r = await fetch("/api/reports/ot-planning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) { const err = await r.json().catch(() => null); toast.error(err?.error || "Failed to save reference."); return; } await loadReferences(); toast.success("Reference saved."); } catch { toast.error("Failed to save reference."); } };
  const del = async (body: unknown) => { const r = await fetch("/api/reports/ot-planning", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) { toast.error("Failed to delete reference."); return; } await loadReferences(); toast.success("Reference deleted."); };
  /** Drag-reorder within one shed — this display_order is what drives row order in the OT Planning report and its Excel/PDF export. Persists silently per unit, then one reload + one toast (not one per row). */
  const reorderDivisions = async (orderedRows: Division[]) => {
    try {
      await Promise.all(orderedRows.map((row, index) => fetch("/api/reports/ot-planning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "division", value: { id: row.id, shed: row.shed, division: row.division, displayOrder: index } }) })));
      await loadReferences();
      toast.success("Unit order updated.");
    } catch {
      toast.error("Failed to update unit order.");
    }
  };
  return <div className="space-y-5"><PageHeader title="OT Planning" description="Overtime planning and budget realization by department." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }, { label: "OT Planning" }]} /><div className="flex gap-2"><Button variant={tab === "report" ? "default" : "outline"} onClick={() => setTab("report")}>OT Planning Report</Button><Button variant={tab === "reference" ? "default" : "outline"} onClick={() => setTab("reference")}>Reference</Button></div>{tab === "reference" ? <References mappings={mappings} divisions={divisions} multipliers={multipliers} configHistory={configHistory} date={dateFrom} post={post} del={del} reorderDivisions={reorderDivisions} /> : <><Card><CardContent className="pt-6"><h2 className="mb-4 text-lg font-semibold">Selected Report</h2><div className="flex flex-wrap items-end gap-5"><div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={setDateFrom} processedDates={processedDates} /></div><div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={setDateTo} processedDates={processedDates} /></div><Button size="icon" className="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md transition-all hover:shadow-lg hover:from-violet-600 hover:to-violet-700" title="Run" aria-label="Run" onClick={() => void load()} disabled={loading}><Play className="size-[18px]" /></Button><div className="flex flex-wrap gap-4 pb-2"><label className="flex items-center gap-2 text-sm"><Checkbox checked={allSelected} onCheckedChange={(checked) => { setAllSelected(checked === true); setSheds(checked ? DEPARTMENTS : []); }} />All Departments</label>{DEPARTMENTS.map((shed) => <label className="flex items-center gap-2 text-sm" key={shed}><Checkbox checked={sheds.includes(shed)} onCheckedChange={(checked) => toggleShed(shed, checked === true)} />{shed}</label>)}</div><div className="ml-auto flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/30 p-1.5 shadow-sm"><Button variant="ghost" size="icon" className="rounded-xl p-1" title="Save estimates" aria-label="Save estimates" onClick={() => void save()} disabled={loading}><ExportImageIcon src="/icons/save-download.jpg" alt="Save" /></Button><Button variant="ghost" size="icon" className="rounded-xl p-1" title="Export Excel" aria-label="Export Excel" onClick={() => window.open(`/api/reports/ot-planning/export?${exportQuery()}`, "_blank")}><ExportImageIcon src="/icons/excel-download.jpg" alt="Excel download" /></Button><Button variant="ghost" size="icon" className="rounded-xl p-1" title="Export PDF" aria-label="Export PDF" onClick={() => window.open(`/api/reports/ot-planning/pdf?${exportQuery()}`, "_blank")}><ExportImageIcon src="/icons/pdf-download.jpg" alt="PDF download" /></Button></div></div><p className="mt-3 text-xs text-muted-foreground"><CalendarCheck className="mr-1 inline size-3" />Green ring indicates a date with completed MPP Calculation.</p></CardContent></Card><div><h2 className="mb-3 text-lg font-semibold">Report Preview</h2>{!hasRun ? <p className="text-sm text-muted-foreground">Select a date range, then click Run to load the report.</p> : loading ? <p>Loading...</p> : data.length ? data.map((g) => <ReportTable key={g.shed} group={g} update={update} />) : <p className="text-sm text-muted-foreground">No report data for the selected filters.</p>}</div></>}</div>;
}

function ReportTable({ group, update }: { group: Report; update: (shed: string, division: string, duration: number, person: number) => void }) {
  const durations = useMemo(() => Array.from(new Set(group.rows.flatMap((r) => r.cells.map((c) => c.duration)))).sort((a, b) => a - b), [group]);
  const holidayByDuration = (d: number) => group.rows.some((r) => r.cells.find((c) => c.duration === d)?.holiday);
  // National Holiday cells price on multipliersHoliday (missing duration -> 0, no
  // fallback formula); everything else keeps the regular bracket + 1.5/2h formula.
  const rate = (d: number, holiday = holidayByDuration(d)) => group.config.umr / group.config.divisor * (holiday ? (group.config.multipliersHoliday?.[String(d)] ?? 0) : (group.config.multipliers?.[String(d)] ?? paidHours(d)));
  const totals = durations.map((duration) => group.rows.reduce((total, row) => {
    const cell = row.cells.find((item) => item.duration === duration);
    return { estimated: total.estimated + (cell?.estimated ?? 0), actual: total.actual + (cell?.actual ?? 0) };
  }, { estimated: 0, actual: 0 }));
  const totalEstimatedIdr = totals.reduce((sum, total, index) => sum + total.estimated * rate(durations[index]), 0);
  const totalActualIdr = totals.reduce((sum, total, index) => sum + total.actual * rate(durations[index]), 0);
  return <Card className="mb-5 overflow-auto"><CardContent className="pt-6"><h3 className="mb-3 text-base font-semibold">{group.shed}</h3><table className="w-full min-w-[1000px] border-collapse text-sm"><thead><tr className="bg-muted"><th className="border p-2 text-left">Unit</th>{durations.map((d) => <th colSpan={4} className="border p-2" key={d}>{d} hours{holidayByDuration(d) ? <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-semibold uppercase text-amber-700">Libur</span> : null}<br /><span className="font-normal">Estimated People / IDR · Actual People / IDR</span></th>)}<th className="border p-2">Total Estimated IDR</th><th className="border p-2">Total Actual IDR</th></tr></thead><tbody>{group.rows.map((row) => <tr key={row.division}><td className="border p-2 font-medium">{row.division}</td>{durations.map((d) => { const c = row.cells.find((x) => x.duration === d) ?? { duration: d, estimated: 0, actual: 0, holiday: false }; return <Fragment key={d}><td className="border p-1"><Input className="h-8 w-16" type="number" min="0" value={c.estimated} onChange={(e) => update(group.shed, row.division, d, Number(e.target.value))} /></td><td className="border p-1">{money(c.estimated * rate(d, c.holiday))}</td><td className="border p-1">{c.actual}</td><td className="border p-1">{money(c.actual * rate(d, c.holiday))}</td></Fragment>; })}<td className="border p-2">{money(row.cells.reduce((s, c) => s + c.estimated * rate(c.duration, c.holiday), 0))}</td><td className="border p-2">{money(row.cells.reduce((s, c) => s + c.actual * rate(c.duration, c.holiday), 0))}</td></tr>)}</tbody><tfoot><tr className="bg-primary/10 font-bold"><td className="border p-2">TOTAL {group.shed}</td>{totals.map((total, index) => <Fragment key={durations[index]}><td className="border p-2">{money(total.estimated)}</td><td className="border p-2">{money(total.estimated * rate(durations[index]))}</td><td className="border p-2">{money(total.actual)}</td><td className="border p-2">{money(total.actual * rate(durations[index]))}</td></Fragment>)}<td className="border p-2">{money(totalEstimatedIdr)}</td><td className="border p-2">{money(totalActualIdr)}</td></tr></tfoot></table></CardContent></Card>;
}

function groupByShed<T extends { shed: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const list = groups.get(row.shed) ?? []; list.push(row); groups.set(row.shed, list); }
  const order = [...SHED_ORDER, ...Array.from(groups.keys()).filter((s) => !SHED_ORDER.includes(s))];
  return order.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!]);
}
const SHED_ORDER = ["SHED A", "SHED B", "SHED C", "COMMON"];

const EMPTY_MAPPING = { attendanceDepartment: "", shed: "SHED A", division: "", displayOrder: 0 };
const EMPTY_DIVISION = { shed: "SHED A", division: "", displayOrder: 0 };
const EMPTY_CONFIG = { effectiveDate: "", umr: 2954114, usdRate: 16000 };
const EMPTY_MULTIPLIER = { duration: "", paidHours: "", paidHoursHoliday: "" };

/** Card section yang bisa di-minimize/maximize — klik header judul untuk toggle kontennya. Default minimized. */
function CollapsibleCard({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card><CardContent className="pt-6">
      <button type="button" className="mb-3 flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <h2 className="font-semibold">{title}</h2>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open ? children : null}
    </CardContent></Card>
  );
}

function References({ mappings, divisions, multipliers, configHistory, date, post, del, reorderDivisions }: any) {
  const [m, setM] = useState<any>(EMPTY_MAPPING);
  const [d, setD] = useState<any>(EMPTY_DIVISION);
  const [c, setC] = useState<ConfigEntry>({ ...EMPTY_CONFIG, effectiveDate: date });
  const mappingGroups = useMemo(() => groupByShed(mappings as Mapping[]), [mappings]);
  const divisionGroups = useMemo(() => groupByShed(divisions as Division[]), [divisions]);
  const divisionOptionsForShed = useMemo(() => (divisions as Division[]).filter((x) => x.shed === m.shed), [divisions, m.shed]);

  const saveMapping = async () => { if (!m.attendanceDepartment || !m.division) return; await post({ kind: "mapping", value: m }); setM(EMPTY_MAPPING); };
  const saveDivision = async () => { if (!d.division) return; await post({ kind: "division", value: d }); setD(EMPTY_DIVISION); };
  const editDivision = (x: Division) => setD({ id: x.id, shed: x.shed, division: x.division, displayOrder: x.display_order });
  const deleteDivision = (x: Division) => void del({ kind: "division", id: x.id });
  const editMapping = (x: Mapping) => setM({ id: x.id, attendanceDepartment: x.attendance_department, shed: x.shed, division: x.division, displayOrder: x.display_order });
  const deleteMapping = (x: Mapping) => void del({ kind: "mapping", id: x.id });
  /** Inline reassignment straight from the table cell — saves immediately, no need to load the row into the top form first. */
  const updateMappingUnit = (x: Mapping, division: string) => void post({ kind: "mapping", value: { id: x.id, attendanceDepartment: x.attendance_department, shed: x.shed, division, displayOrder: x.display_order } });
  const saveConfig = async () => { if (!c.effectiveDate) return; await post({ kind: "config", value: c }); setC({ ...EMPTY_CONFIG, effectiveDate: date }); };
  const editConfig = (x: ConfigEntry) => setC({ id: x.id, effectiveDate: x.effectiveDate, umr: x.umr, usdRate: x.usdRate });
  const cancelEditConfig = () => setC({ ...EMPTY_CONFIG, effectiveDate: date });
  const deleteConfig = (x: ConfigEntry) => void del({ kind: "config", id: x.id });

  const [mul, setMul] = useState<any>(EMPTY_MULTIPLIER);
  const saveMultiplier = async () => { if (mul.duration === "" || mul.paidHours === "") return; await post({ kind: "multiplier", value: { id: mul.id, duration: Number(mul.duration), paidHours: Number(mul.paidHours), paidHoursHoliday: Number(mul.paidHoursHoliday || 0) } }); setMul(EMPTY_MULTIPLIER); };
  const editMultiplier = (x: Multiplier) => setMul({ id: x.id, duration: x.duration, paidHours: x.paid_hours, paidHoursHoliday: x.paid_hours_holiday });
  const deleteMultiplier = (x: Multiplier) => void del({ kind: "multiplier", id: x.id });
  /** Per-duration checkbox: whether this duration always gets a column in the Excel export (even when empty). Saves immediately. */
  const toggleMultiplierExport = (x: Multiplier, checked: boolean) => void post({ kind: "multiplier", value: { id: x.id, duration: x.duration, paidHours: x.paid_hours, paidHoursHoliday: x.paid_hours_holiday, showInExport: checked } });

  return <div className="grid gap-5">
    <Card><CardContent className="pt-6">
      <h2 className="mb-3 font-semibold">UMR / USD Rate History</h2>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div><label className="mb-1 block text-xs font-medium">Effective Date</label><Input type="date" className="w-40" value={c.effectiveDate} onChange={(e) => setC({ ...c, effectiveDate: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium">UMR (IDR)</label><Input type="number" className="w-40" value={c.umr} onChange={(e) => setC({ ...c, umr: Number(e.target.value) })} /></div>
        <div><label className="mb-1 block text-xs font-medium">USD Rate (IDR)</label><Input type="number" className="w-40" value={c.usdRate} onChange={(e) => setC({ ...c, usdRate: Number(e.target.value) })} /></div>
        <Button onClick={() => void saveConfig()}>{c.id ? <><Pencil className="size-4" />Update</> : <><Plus className="size-4" />Add</>}</Button>
        {c.id ? <Button variant="outline" onClick={cancelEditConfig}><X className="size-4" />Cancel</Button> : null}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Divisor is fixed at 173. Each entry applies from its Effective Date onward until a later entry takes over — add a new entry when UMR changes (e.g. yearly); past calculations keep using whichever value was effective at the time.</p>
      <div className="overflow-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead><tr className="bg-muted"><th className="border p-2 text-left">Effective Date</th><th className="border p-2 text-left">UMR</th><th className="border p-2 text-left">USD Rate</th><th className="border p-2 text-right">Action</th></tr></thead>
          <tbody>
            {(configHistory as ConfigEntry[]).length === 0 && <tr><td colSpan={4} className="border p-3 text-center text-muted-foreground">No UMR history yet.</td></tr>}
            {(configHistory as ConfigEntry[]).map((x) => <tr key={x.id}><td className="border p-2">{x.effectiveDate}</td><td className="border p-2">{money(x.umr)}</td><td className="border p-2">{money(x.usdRate)}</td><td className="border p-2 text-right"><Button variant="ghost" size="icon" onClick={() => editConfig(x)} title="Edit"><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteConfig(x)} title="Delete"><Trash2 className="size-4" /></Button></td></tr>)}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
    <CollapsibleCard title="Duration & Paid Hours">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><label className="mb-1 block text-xs font-medium">Duration (jam)</label><Input type="number" step="0.5" min="0" className="h-8 w-24" value={mul.duration} onChange={(e) => setMul({ ...mul, duration: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium">Regular OT</label><Input type="number" step="0.5" min="0" className="h-8 w-24" value={mul.paidHours} onChange={(e) => setMul({ ...mul, paidHours: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium">National Holiday</label><Input type="number" step="0.5" min="0" className="h-8 w-24" value={mul.paidHoursHoliday} onChange={(e) => setMul({ ...mul, paidHoursHoliday: e.target.value })} /></div>
        <Button size="sm" onClick={() => void saveMultiplier()}>{mul.id ? <><Pencil className="size-4" />Update</> : <><Plus className="size-4" />Add</>}</Button>
        {mul.id ? <Button size="sm" variant="outline" onClick={() => setMul(EMPTY_MULTIPLIER)}><X className="size-4" />Cancel</Button> : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Kolom <b>National Holiday</b> dipakai saat keterangan absensi = &quot;Hari Libur Pemerintah&quot;. Durasi tanpa nilai National Holiday dihitung 0.</p>
      <p className="mb-2 text-xs text-muted-foreground">Kolom <b>Excel</b>: durasi yang dicentang selalu muncul sebagai kolom di export Excel (sheet OT Planning &amp; RECAP) walau kosong. Durasi yang ada datanya tetap muncul walau tidak dicentang.</p>
      <div className="overflow-auto">
        <table className="w-full max-w-md border-collapse text-xs">
          <thead><tr className="bg-muted"><th className="border p-1 text-left">Duration</th><th className="border p-1 text-right">Regular OT</th><th className="border p-1 text-right">National Holiday</th><th className="border p-1 text-center">Excel</th><th className="border p-1" /></tr></thead>
          <tbody>
            {(multipliers as Multiplier[]).length === 0 && <tr><td colSpan={5} className="border p-2 text-center text-muted-foreground">Belum ada data.</td></tr>}
            {(multipliers as Multiplier[]).map((x) => <tr key={x.id ?? x.duration}><td className="border p-1">{x.duration} jam</td><td className="border p-1 text-right">{x.paid_hours}</td><td className="border p-1 text-right">{x.paid_hours_holiday || 0}</td><td className="border p-1 text-center"><Checkbox checked={!!x.show_in_export} onCheckedChange={(checked) => toggleMultiplierExport(x, checked === true)} aria-label={`Tampilkan kolom ${x.duration} jam di Excel`} /></td><td className="border p-1 text-right whitespace-nowrap"><button className="inline-flex size-6 items-center justify-center rounded hover:bg-muted" title="Edit" onClick={() => editMultiplier(x)}><Pencil className="size-3" /></button><button className="inline-flex size-6 items-center justify-center rounded hover:bg-destructive/10" title="Delete" onClick={() => deleteMultiplier(x)}><Trash2 className="size-3 text-destructive" /></button></td></tr>)}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>

    <CollapsibleCard title="Units by Shed">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={d.shed} onValueChange={(v) => setD({ ...d, shed: v })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{DEPARTMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Input className="w-56" placeholder="Unit" value={d.division} onChange={(e) => setD({ ...d, division: e.target.value })} />
        <Button onClick={() => void saveDivision()}>{d.id ? <><Pencil className="size-4" />Update</> : <><Plus className="size-4" />Add</>}</Button>
        {d.id ? <Button variant="outline" onClick={() => setD(EMPTY_DIVISION)}><X className="size-4" />Cancel</Button> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {divisionGroups.map(([shed, rows]) => <SortableUnitsTable key={shed} shed={shed} rows={rows} onEdit={editDivision} onDelete={deleteDivision} onReorder={reorderDivisions} />)}
      </div>
    </CollapsibleCard>

    <CollapsibleCard title="Department Mapping">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Attendance department" value={m.attendanceDepartment} onChange={(e) => setM({ ...m, attendanceDepartment: e.target.value })} />
        <Select value={m.shed} onValueChange={(v) => setM({ ...m, shed: v, division: "" })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{DEPARTMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={m.division} onValueChange={(v) => setM({ ...m, division: v })}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Unit" /></SelectTrigger>
          <SelectContent>{divisionOptionsForShed.map((x) => <SelectItem key={x.id} value={x.division}>{x.division}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => void saveMapping()}>{m.id ? <><Pencil className="size-4" />Update</> : <><Plus className="size-4" />Add</>}</Button>
        {m.id ? <Button variant="outline" onClick={() => setM(EMPTY_MAPPING)}><X className="size-4" />Cancel</Button> : null}
      </div>
      <div className="grid gap-5">
        {mappingGroups.map(([shed, rows]) => <div key={shed}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{shed}</h3>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-muted"><th className="border p-2 text-left">Attendance Department</th><th className="border p-2 text-left">Unit</th><th className="border p-2 text-right">Actions</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.id}><td className="border p-2">{x.attendance_department}</td><td className="border p-1">
              <Select value={x.division} onValueChange={(v) => updateMappingUnit(x, v)}>
                <SelectTrigger className="h-8 w-full border-0 bg-transparent shadow-none hover:bg-muted"><SelectValue /></SelectTrigger>
                <SelectContent>{(divisions as Division[]).filter((u) => u.shed === x.shed).map((u) => <SelectItem key={u.id} value={u.division}>{u.division}</SelectItem>)}</SelectContent>
              </Select>
            </td><td className="border p-1 text-right"><div className="flex justify-end gap-1"><button className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted" title="Edit" onClick={() => editMapping(x)}><Pencil className="size-3.5" /></button><button className="inline-flex size-7 items-center justify-center rounded-md hover:bg-destructive/10" title="Delete" onClick={() => deleteMapping(x)}><Trash2 className="size-3.5 text-destructive" /></button></div></td></tr>)}</tbody>
          </table>
        </div>)}
      </div>
    </CollapsibleCard>
  </div>;
}

/** Drag order here IS the row order in the OT Planning report and its Excel/PDF export — reordering is scoped to this one shed's own SortableContext, so a drag can't move a unit into a different shed's list. */
function SortableUnitsTable({ shed, rows, onEdit, onDelete, onReorder }: { shed: string; rows: Division[]; onEdit: (x: Division) => void; onDelete: (x: Division) => void; onReorder: (orderedRows: Division[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((x) => x.id === active.id);
    const newIndex = rows.findIndex((x) => x.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(rows, oldIndex, newIndex));
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{shed}</h3>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-muted"><th className="border p-2" /><th className="border p-2 text-left">Unit</th><th className="border p-2 text-right">Actions</th></tr></thead>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((x) => x.id!)} strategy={verticalListSortingStrategy}>
            <tbody>{rows.map((x) => <SortableUnitRow key={x.id} row={x} onEdit={() => onEdit(x)} onDelete={() => onDelete(x)} />)}</tbody>
          </SortableContext>
        </DndContext>
      </table>
    </div>
  );
}

function SortableUnitRow({ row, onEdit, onDelete }: { row: Division; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={style}>
      <td className="border p-1 text-center">
        <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label="Drag to reorder">
          <GripVertical className="mx-auto size-3.5" />
        </button>
      </td>
      <td className="border p-2">{row.division}</td>
      <td className="border p-1 text-right">
        <div className="flex justify-end gap-1">
          <button className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted" title="Edit" onClick={onEdit}><Pencil className="size-3.5" /></button>
          <button className="inline-flex size-7 items-center justify-center rounded-md hover:bg-destructive/10" title="Delete" onClick={onDelete}><Trash2 className="size-3.5 text-destructive" /></button>
        </div>
      </td>
    </tr>
  );
}
