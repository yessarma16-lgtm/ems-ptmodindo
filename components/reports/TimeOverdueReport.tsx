"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, FileSpreadsheet, Play, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { useEmployeeReportSession, type TimeOverdueUnitRow } from "@/components/reports/EmployeeReportSession";
import { toast } from "sonner";

const SHED_ORDER = ["SHED A", "SHED B", "SHED C", "COMMON"];
const BUCKETS = ["0:00 - 0:15", "0:16 - 0:20", "> 0:21 Minute"] as const;

function groupByShed(rows: TimeOverdueUnitRow[]): [string, TimeOverdueUnitRow[]][] {
  const groups = new Map<string, TimeOverdueUnitRow[]>();
  for (const row of rows) groups.set(row.shed, [...(groups.get(row.shed) ?? []), row]);
  const order = [...SHED_ORDER, ...Array.from(groups.keys()).filter((s) => !SHED_ORDER.includes(s))];
  return order.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!]);
}

export function TimeOverdueReport() {
  const { timeOverdue, setTimeOverdue, clearTimeOverdue } = useEmployeeReportSession();
  const { dateFrom, dateTo, report, hasRun } = timeOverdue;
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined); }, []);

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; }
    setTimeOverdue({ hasRun: true }); setLoading(true);
    try { const r = await fetch(`/api/reports/time-overdue?${new URLSearchParams({ dateFrom, dateTo })}`, { cache: "no-store" }); if (!r.ok) throw new Error("Gagal memuat laporan."); setTimeOverdue({ report: await r.json() }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal memuat laporan."); }
    finally { setLoading(false); }
  }

  const groups = report ? groupByShed(report.units) : [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="mb-1 block text-xs font-medium">Dari</label><AttendanceDatePicker value={dateFrom} onChange={(v) => setTimeOverdue({ dateFrom: v })} processedDates={processedDates} /></div>
        <div><label className="mb-1 block text-xs font-medium">Sampai</label><AttendanceDatePicker value={dateTo} onChange={(v) => setTimeOverdue({ dateTo: v })} processedDates={processedDates} /></div>
        <Button size="icon" onClick={() => void load()} disabled={loading} title="Jalankan"><Play className="size-4" /></Button>
        <Button variant="outline" size="icon" onClick={clearTimeOverdue} disabled={loading} title="Bersihkan"><X className="size-4" /></Button>
      </div>
      <Button variant="outline" size="icon" title="Export Excel" onClick={() => window.open(`/api/reports/time-overdue/export?${new URLSearchParams({ dateFrom, dateTo })}`, "_blank")}><FileSpreadsheet className="size-4" /></Button>
    </div>
    <p className="text-xs text-muted-foreground"><CalendarCheck className="mr-1 inline size-3" />Lingkaran hijau menandakan tanggal sudah selesai MPP Calculation.</p>
    {!hasRun ? <p className="text-sm text-muted-foreground">Pilih periode lalu klik Jalankan.</p> : loading ? <p className="text-sm text-muted-foreground">Memuat...</p> : !report || groups.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada data untuk filter yang dipilih.</p> :
      <div className="space-y-4">{groups.map(([shed, units]) => <Card key={shed} className="w-fit max-w-full overflow-auto"><CardContent className="pt-4"><h3 className="mb-2 text-sm font-semibold">{shed}</h3><table className="w-auto border-collapse text-xs"><thead><tr className="bg-muted"><th className="border px-2 py-1 text-left">Unit</th>{BUCKETS.map((b) => <th className="border px-2 py-1" key={b}>{b}</th>)}<th className="border px-2 py-1">Total</th></tr></thead><tbody>{units.map((u) => <tr key={u.division}><td className="border px-2 py-1 font-medium">{u.division}</td>{BUCKETS.map((b) => <td className="border px-2 py-1 text-center" key={b}>{u.counts[b] || 0}</td>)}<td className="border px-2 py-1 text-center font-medium">{u.total}</td></tr>)}</tbody><tfoot><tr className="bg-primary/10 font-bold"><td className="border px-2 py-1">TOTAL {shed}</td>{BUCKETS.map((b) => <td className="border px-2 py-1 text-center" key={b}>{units.reduce((s, u) => s + (u.counts[b] || 0), 0)}</td>)}<td className="border px-2 py-1 text-center">{units.reduce((s, u) => s + u.total, 0)}</td></tr></tfoot></table></CardContent></Card>)}</div>}
  </div>;
}
