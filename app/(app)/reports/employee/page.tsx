"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, FileSpreadsheet, Play, X } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { useEmployeeReportSession, type TimeOverdueUnitRow } from "@/components/reports/EmployeeReportSession";
import { toast } from "sonner";

const SHED_ORDER = ["SHED A", "SHED B", "SHED C", "COMMON"];
const BUCKETS = ["0:00 - 0:15", "0:16 - 0:20", "> 0:21 Minute"] as const;

function groupByShed(rows: TimeOverdueUnitRow[]): [string, TimeOverdueUnitRow[]][] {
  const groups = new Map<string, TimeOverdueUnitRow[]>();
  for (const row of rows) { const list = groups.get(row.shed) ?? []; list.push(row); groups.set(row.shed, list); }
  const order = [...SHED_ORDER, ...Array.from(groups.keys()).filter((s) => !SHED_ORDER.includes(s))];
  return order.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!]);
}

export default function EmployeeReportPage() {
  return (
    <div>
      <PageHeader
        title="Employee Report"
        description="Report Time Overdue — selisih jam clock-in aktual terhadap jadwal, per unit."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "Employee Report" }]}
      />

      <Card>
        <CardContent className="pt-6">
          <TimeOverdueReport />
        </CardContent>
      </Card>
    </div>
  );
}

function TimeOverdueReport() {
  const { timeOverdue, setTimeOverdue, clearTimeOverdue } = useEmployeeReportSession();
  const { dateFrom, dateTo, report, hasRun } = timeOverdue;
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined);
  }, []);

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; }
    setTimeOverdue({ hasRun: true });
    setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom, dateTo });
      const r = await fetch(`/api/reports/time-overdue?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load report.");
      setTimeOverdue({ report: await r.json() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  const exportQuery = () => new URLSearchParams({ dateFrom, dateTo }).toString();
  const groups = report ? groupByShed(report.units) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-wrap items-end gap-5">
          <div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={(v) => setTimeOverdue({ dateFrom: v })} processedDates={processedDates} /></div>
          <div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={(v) => setTimeOverdue({ dateTo: v })} processedDates={processedDates} /></div>
          <Button
            size="icon"
            className="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md transition-all hover:shadow-lg hover:from-violet-600 hover:to-violet-700"
            title="Run"
            aria-label="Run"
            onClick={() => void load()}
            disabled={loading}
          >
            <Play className="size-[18px]" />
          </Button>
          <Button variant="outline" size="icon" title="Clear" aria-label="Clear" onClick={clearTimeOverdue} disabled={loading}>
            <X className="size-[18px]" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/30 p-1.5 shadow-sm">
          <Button
            size="icon"
            className="rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-md transition-all hover:shadow-lg hover:from-sky-600 hover:to-sky-700"
            title="Export Excel"
            aria-label="Export Excel"
            onClick={() => window.open(`/api/reports/time-overdue/export?${exportQuery()}`, "_blank")}
          >
            <FileSpreadsheet className="size-[18px]" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground"><CalendarCheck className="mr-1 inline size-3" />Green ring indicates a date with completed MPP Calculation. Counts IT1 (actual clock-in) minus scheduled InTime, per attendance record. IT1 at or before InTime counts as Normal.</p>

      {!hasRun ? <p className="text-sm text-muted-foreground">Select a date range, then click Run to load the report.</p> : loading ? <p className="text-sm text-muted-foreground">Loading...</p> : !report || groups.length === 0 ? <p className="text-sm text-muted-foreground">No data for the selected filters.</p> : (
        <div className="grid gap-5">
          {groups.map(([shed, units]) => {
            const totals = BUCKETS.reduce((acc, b) => { acc[b] = units.reduce((sum, u) => sum + (u.counts[b] || 0), 0); return acc; }, {} as Record<string, number>);
            const grandTotal = units.reduce((sum, u) => sum + u.total, 0);
            return (
              <Card key={shed} className="overflow-auto">
                <CardContent className="pt-6">
                  <h3 className="mb-3 text-base font-semibold">{shed}</h3>
                  <table className="w-full min-w-[600px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 text-left">Unit</th>
                        {BUCKETS.map((b) => <th className="border p-2" key={b}>{b}</th>)}
                        <th className="border p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.division}>
                          <td className="border p-2 font-medium">{u.division}</td>
                          {BUCKETS.map((b) => <td className="border p-2 text-center" key={b}>{u.counts[b] || 0}</td>)}
                          <td className="border p-2 text-center font-medium">{u.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-primary/10 font-bold">
                        <td className="border p-2">TOTAL {shed}</td>
                        {BUCKETS.map((b) => <td className="border p-2 text-center" key={b}>{totals[b]}</td>)}
                        <td className="border p-2 text-center">{grandTotal}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
