"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, FileSpreadsheet, Loader2, Play } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { toast } from "sonner";

const SHED_ORDER = ["SHED A", "SHED B", "SHED C", "COMMON"];
const BUCKETS = ["0:00 - 0:15", "0:16 - 0:20", "> 0:21 Minute"] as const;

type UnitRow = { shed: string; division: string; counts: Record<string, number>; total: number };
type TimeOverdueReport = { units: UnitRow[]; detail: Record<string, unknown[]> };

function groupByShed(rows: UnitRow[]): [string, UnitRow[]][] {
  const groups = new Map<string, UnitRow[]>();
  for (const row of rows) { const list = groups.get(row.shed) ?? []; list.push(row); groups.set(row.shed, list); }
  const order = [...SHED_ORDER, ...Array.from(groups.keys()).filter((s) => !SHED_ORDER.includes(s))];
  return order.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!]);
}

export default function EmployeeReportPage() {
  return (
    <div>
      <PageHeader
        title="Employee Report"
        description="Employee reporting."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "Employee Report" }]}
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="time-overdue">
            <TabsList>
              <TabsTrigger value="time-overdue">Report Time Overdue</TabsTrigger>
              <TabsTrigger value="mangkir">Report Mangkir</TabsTrigger>
              <TabsTrigger value="setup">Setup</TabsTrigger>
            </TabsList>
            <TabsContent value="time-overdue">
              <TimeOverdueReportTab />
            </TabsContent>
            <TabsContent value="mangkir">
              <MangkirReportTab />
            </TabsContent>
            <TabsContent value="setup">
              <SetupTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function TimeOverdueReportTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [report, setReport] = useState<TimeOverdueReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined);
  }, []);

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; }
    setHasRun(true);
    setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom, dateTo });
      const r = await fetch(`/api/reports/time-overdue?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load report.");
      setReport(await r.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  const exportQuery = () => new URLSearchParams({ dateFrom, dateTo }).toString();
  const groups = report ? groupByShed(report.units) : [];

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-wrap items-end gap-5">
          <div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={setDateFrom} processedDates={processedDates} /></div>
          <div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={setDateTo} processedDates={processedDates} /></div>
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

interface MangkirEmployee {
  recordId: string;
  nik: string;
  name: string;
  department: string;
  shed: string;
  division: string;
  streakDates: string[];
  streakLength: number;
}
interface MangkirReport {
  threshold: number;
  employees: MangkirEmployee[];
}

/**
 * "Report Mangkir" — Active employees with `threshold`+ consecutive SCHEDULED
 * WORK DAYS of unauthorized absence (kategori = "Mangkir" in attendance, not
 * merely a blank clock time — see lib/mangkir-service.ts). Threshold is set
 * on the Setup tab.
 */
function MangkirReportTab() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [report, setReport] = useState<MangkirReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined);
  }, []);

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; }
    setHasRun(true);
    setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom, dateTo });
      const r = await fetch(`/api/reports/mangkir?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load report.");
      setReport(await r.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-end gap-5">
        <div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={setDateFrom} processedDates={processedDates} /></div>
        <div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={setDateTo} processedDates={processedDates} /></div>
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
      </div>
      <p className="text-xs text-muted-foreground">
        <AlertTriangle className="mr-1 inline size-3" />
        Karyawan Active dengan {report?.threshold ?? "N"}+ hari kerja Mangkir berturut-turut (Minggu/libur nasional dilewati, tidak memutus rentetan; hari kerja lain — Normal, Cuti, Ijin, dll — memutus rentetan). Ubah ambang batas di tab Setup.
      </p>

      {!hasRun ? (
        <p className="text-sm text-muted-foreground">Pilih rentang tanggal, lalu klik Run.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !report || report.employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada karyawan yang mangkir {report?.threshold ?? ""}+ hari kerja berturut-turut pada rentang ini.</p>
      ) : (
        <Card className="overflow-auto">
          <CardContent className="pt-6">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">NIK</th>
                  <th className="border p-2 text-left">Name</th>
                  <th className="border p-2 text-left">Department</th>
                  <th className="border p-2 text-left">Shed / Unit</th>
                  <th className="border p-2">Streak (hari kerja)</th>
                  <th className="border p-2 text-left">Tanggal Mangkir</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.map((e) => (
                  <tr key={e.recordId}>
                    <td className="border p-2">{e.nik}</td>
                    <td className="border p-2 font-medium">
                      <Link href={`/employees/${e.recordId}`} className="text-primary hover:underline">{e.name}</Link>
                    </td>
                    <td className="border p-2">{e.department}</td>
                    <td className="border p-2">{e.shed} {e.division && `/ ${e.division}`}</td>
                    <td className="border p-2 text-center"><Badge variant="destructive">{e.streakLength}</Badge></td>
                    <td className="border p-2 text-xs">{e.streakDates.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface DurationFilter {
  duration: number;
  timeOverdueFilter: boolean;
}

/**
 * "Setup" tab — lets HR restrict Report Time Overdue to only attendance whose
 * FINAL OTH (overtime hours) matches a checked duration (e.g. only OTH = 1
 * hour). No duration checked = report shows everything, same as before this
 * existed. Toggling saves immediately (same pattern as the OT Planning
 * "show in export" checkboxes it shares its duration list with).
 */
function SetupTab() {
  const [durations, setDurations] = useState<DurationFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDuration, setSavingDuration] = useState<number | null>(null);

  const [threshold, setThreshold] = useState<number | "">("");
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    fetch("/api/reports/time-overdue/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => setDurations(v.durations ?? []))
      .catch(() => toast.error("Failed to load setup."))
      .finally(() => setLoading(false));

    fetch("/api/reports/mangkir/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => setThreshold(v.threshold ?? 3))
      .catch(() => toast.error("Failed to load setup."))
      .finally(() => setThresholdLoading(false));
  }, []);

  async function saveThreshold() {
    if (threshold === "" || threshold < 1) { toast.error("Masukkan angka minimal 1."); return; }
    setSavingThreshold(true);
    try {
      const res = await fetch("/api/reports/mangkir/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      if (!res.ok) throw new Error();
      toast.success("Threshold Mangkir disimpan.");
    } catch {
      toast.error("Gagal menyimpan threshold.");
    } finally {
      setSavingThreshold(false);
    }
  }

  async function toggle(duration: number, checked: boolean) {
    setDurations((prev) => prev.map((d) => (d.duration === duration ? { ...d, timeOverdueFilter: checked } : d)));
    setSavingDuration(duration);
    try {
      const res = await fetch("/api/reports/time-overdue/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration, timeOverdueFilter: checked }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to save. Reverting.");
      setDurations((prev) => prev.map((d) => (d.duration === duration ? { ...d, timeOverdueFilter: !checked } : d)));
    } finally {
      setSavingDuration(null);
    }
  }

  const checkedCount = durations.filter((d) => d.timeOverdueFilter).length;

  return (
    <div className="mt-4 space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Report Mangkir</h3>
        <p className="text-sm text-muted-foreground">Jumlah hari kerja Mangkir berturut-turut sebelum karyawan di-flag (Minggu/libur nasional dilewati, tidak memutus rentetan).</p>
        {thresholdLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="h-9 w-24"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value === "" ? "" : Number(e.target.value))}
            />
            <span className="text-sm text-muted-foreground">hari kerja</span>
            <Button size="sm" onClick={() => void saveThreshold()} disabled={savingThreshold}>
              {savingThreshold ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Report Time Overdue — Filter OTH</h3>
        <p className="text-sm text-muted-foreground">
          Centang durasi OTH (Final OTH) yang mau dimasukkan ke Report Time Overdue.{" "}
          {checkedCount === 0 ? "Belum ada yang dicentang — report menampilkan semua data (tanpa filter)." : `${checkedCount} durasi dicentang — report hanya menghitung data dengan OTH tersebut.`}
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-4 lg:grid-cols-6">
            {durations.map((d) => (
              <label key={d.duration} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={d.timeOverdueFilter}
                  onCheckedChange={(checked) => void toggle(d.duration, checked === true)}
                  aria-label={`Filter OTH ${d.duration} jam`}
                />
                OTH {d.duration} jam
                {savingDuration === d.duration && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
