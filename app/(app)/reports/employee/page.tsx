"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, FileDown, FileSpreadsheet, Loader2, MessageCircle, Play, X } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { formatDateDMY } from "@/lib/date-format";
import { useEmployeeReportSession, type TimeOverdueUnitRow, type MangkirEvent } from "@/components/reports/EmployeeReportSession";
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
    <div className="mt-4 space-y-5">
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

function letterPdfUrl(e: MangkirEvent) {
  const q = new URLSearchParams({
    recordId: e.recordId, nik: e.nik, name: e.name, position: e.position, department: e.department,
    address: e.address, shed: e.shed, division: e.division,
    phoneNumber: e.phoneNumber, level: String(e.level), episodeStartDate: e.episodeStartDate, dates: e.triggerDates.join(","),
  });
  return `/api/reports/mangkir/letter/pdf?${q}`;
}

/**
 * "Report Mangkir" — Active employees whose unauthorized absence (kategori =
 * "Mangkir" in attendance, not merely a blank clock time — see
 * lib/mangkir-service.ts) reaches the Surat Panggilan 1 or 2 threshold
 * (Minggu/libur nasional dilewati, tidak memutus rentetan; hari kerja lain —
 * Normal, Cuti, Ijin, dll — memutus rentetan). Thresholds are set on the
 * Setup tab. Each row is one (employee, episode, level) event — a
 * still-ongoing absence that reaches both levels gets two rows.
 */
function MangkirReportTab() {
  const { mangkir, setMangkir, clearMangkir } = useEmployeeReportSession();
  const { dateFrom, dateTo, report, hasRun } = mangkir;
  const levelFilter = new Set(mangkir.levelFilter);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [numberDialogEvent, setNumberDialogEvent] = useState<MangkirEvent | null>(null);
  const [numberInput, setNumberInput] = useState("");
  const [savingNumber, setSavingNumber] = useState(false);

  useEffect(() => {
    fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined);
  }, []);

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; }
    setMangkir({ hasRun: true });
    setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom, dateTo });
      const r = await fetch(`/api/reports/mangkir?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load report.");
      setMangkir({ report: await r.json() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  const eventKey = (e: MangkirEvent) => `${e.recordId}|${e.episodeStartDate}|${e.level}`;

  function toggleLevelFilter(level: 1 | 2) {
    const next = new Set(levelFilter);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    setMangkir({ levelFilter: Array.from(next) });
  }

  const filteredEvents = report?.events.filter((e) => levelFilter.has(e.level)) ?? [];

  async function sendWhatsApp(e: MangkirEvent) {
    if (!e.phoneNumber) { toast.error("Karyawan ini belum punya nomor HP di data master."); return; }
    setSendingKey(eventKey(e));
    try {
      const res = await fetch("/api/reports/mangkir/letter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: e }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyiapkan pesan.");
      window.open(data.whatsappLink, "_blank");
      void load(); // refresh so "Sudah dikirim" status shows immediately
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim.");
    } finally {
      setSendingKey(null);
    }
  }

  function openNumberDialog(e: MangkirEvent) {
    setNumberDialogEvent(e);
    setNumberInput(e.letterNumber);
  }

  async function confirmNumberDialog() {
    const e = numberDialogEvent;
    if (!e) return;
    setSavingNumber(true);
    try {
      const res = await fetch("/api/reports/mangkir/letter/number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: e.recordId, nik: e.nik, level: e.level, episodeStartDate: e.episodeStartDate,
          triggerDates: e.triggerDates, letterNumber: numberInput,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan nomor surat.");
      const savedEvent = { ...e, letterNumber: numberInput.trim() };
      setMangkir({
        report: report ? { ...report, events: report.events.map((x) => (eventKey(x) === eventKey(e) ? savedEvent : x)) } : report,
      });
      setNumberDialogEvent(null);
      window.open(letterPdfUrl(savedEvent), "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan nomor surat.");
    } finally {
      setSavingNumber(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-end gap-5">
        <div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={(v) => setMangkir({ dateFrom: v })} processedDates={processedDates} /></div>
        <div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={(v) => setMangkir({ dateTo: v })} processedDates={processedDates} /></div>
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
        <Button variant="outline" size="icon" title="Clear" aria-label="Clear" onClick={clearMangkir} disabled={loading}>
          <X className="size-[18px]" />
        </Button>
        <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/30 p-1.5 shadow-sm">
          {([1, 2] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevelFilter(level)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                levelFilter.has(level) ? "bg-rose-600 text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              SP{level}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <AlertTriangle className="mr-1 inline size-3" />
        Surat Panggilan 1 pada {report?.sp1Threshold ?? "N"} hari kerja Mangkir berturut-turut, Surat Panggilan 2 pada {report?.sp2Threshold ?? "N"} hari kerja (Minggu/libur nasional dilewati, tidak memutus rentetan; hari kerja lain memutus rentetan). Ubah ambang batas di tab Setup. Report ini live — dihitung ulang tiap klik Run, tidak disimpan.
      </p>

      {!hasRun ? (
        <p className="text-sm text-muted-foreground">Pilih rentang tanggal, lalu klik Run.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !report || filteredEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada karyawan yang kena Surat Panggilan pada rentang/filter ini.</p>
      ) : (
        <Card className="overflow-auto">
          <CardContent className="pt-6">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">NIK</th>
                  <th className="border p-2 text-left">Name</th>
                  <th className="border p-2 text-left">Jabatan</th>
                  <th className="border p-2 text-left">Department</th>
                  <th className="border p-2">Level</th>
                  <th className="border p-2 text-left">Tanggal Mangkir</th>
                  <th className="border p-2 text-left">Status</th>
                  <th className="border p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((e) => (
                  <tr key={eventKey(e)}>
                    <td className="border p-2">{e.nik}</td>
                    <td className="border p-2 font-medium">
                      <Link href={`/employees/${e.recordId}`} className="text-primary hover:underline">{e.name}</Link>
                    </td>
                    <td className="border p-2">{e.position}</td>
                    <td className="border p-2">{e.department}</td>
                    <td className="border p-2 text-center"><Badge variant="destructive">SP {e.level}</Badge></td>
                    <td className="border p-2">
                      <div className="flex flex-wrap gap-1">
                        {e.triggerDates.map((d) => (
                          <span key={d} className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap">
                            {formatDateDMY(d)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="border p-2 text-xs">
                      {e.sentAt ? `Sudah dikirim ${new Date(e.sentAt).toLocaleDateString("id-ID")}${e.sentBy ? ` oleh ${e.sentBy}` : ""}` : <span className="text-muted-foreground">Belum dikirim</span>}
                    </td>
                    <td className="border p-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="icon" title="Download Surat (PDF)" onClick={() => openNumberDialog(e)}>
                          <FileDown className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={sendingKey === eventKey(e) || !e.phoneNumber}
                          title={e.phoneNumber ? "Kirim via WhatsApp" : "Karyawan belum punya nomor HP"}
                          onClick={() => void sendWhatsApp(e)}
                        >
                          {sendingKey === eventKey(e) ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!numberDialogEvent} onOpenChange={(open) => !open && setNumberDialogEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nomor Surat</DialogTitle>
            <DialogDescription>
              Masukkan nomor Surat Panggilan {numberDialogEvent?.level} untuk {numberDialogEvent?.name} (mis. 5/HRD_SPK/VII/2026). Nomor ini tersimpan otomatis untuk surat ini.
            </DialogDescription>
          </DialogHeader>
          <Input value={numberInput} onChange={(e) => setNumberInput(e.target.value)} placeholder="5/HRD_SPK/VII/2026" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNumberDialogEvent(null)} disabled={savingNumber}>Cancel</Button>
            <Button onClick={() => void confirmNumberDialog()} disabled={savingNumber}>
              {savingNumber ? <Loader2 className="size-4 animate-spin" /> : "Simpan & Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const [sp1Threshold, setSp1Threshold] = useState<number | "">("");
  const [sp2Threshold, setSp2Threshold] = useState<number | "">("");
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<1 | 2 | null>(null);

  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [savingSigner, setSavingSigner] = useState(false);

  useEffect(() => {
    fetch("/api/reports/time-overdue/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => setDurations(v.durations ?? []))
      .catch(() => toast.error("Failed to load setup."))
      .finally(() => setLoading(false));

    fetch("/api/reports/mangkir/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => {
        setSp1Threshold(v.sp1Threshold ?? 3);
        setSp2Threshold(v.sp2Threshold ?? 5);
        setSignerName(v.signerName ?? "");
        setSignerTitle(v.signerTitle ?? "");
      })
      .catch(() => toast.error("Failed to load setup."))
      .finally(() => setThresholdLoading(false));
  }, []);

  async function saveThreshold(level: 1 | 2, value: number | "") {
    if (value === "" || value < 1) { toast.error("Masukkan angka minimal 1."); return; }
    setSavingLevel(level);
    try {
      const res = await fetch("/api/reports/mangkir/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, threshold: value }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Threshold Surat Panggilan ${level} disimpan.`);
    } catch {
      toast.error("Gagal menyimpan threshold.");
    } finally {
      setSavingLevel(null);
    }
  }

  async function saveSigner() {
    if (!signerName.trim() || !signerTitle.trim()) { toast.error("Nama dan jabatan wajib diisi."); return; }
    setSavingSigner(true);
    try {
      const res = await fetch("/api/reports/mangkir/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName, signerTitle }),
      });
      if (!res.ok) throw new Error();
      toast.success("Penandatangan disimpan.");
    } catch {
      toast.error("Gagal menyimpan penandatangan.");
    } finally {
      setSavingSigner(false);
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
        <h3 className="text-sm font-semibold">Report Mangkir — Ambang Batas Surat Panggilan</h3>
        <p className="text-sm text-muted-foreground">Jumlah hari kerja Mangkir berturut-turut sebelum karyawan dikenakan Surat Panggilan (Minggu/libur nasional dilewati, tidak memutus rentetan).</p>
        {thresholdLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-36 text-sm">Surat Panggilan 1</span>
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                value={sp1Threshold}
                onChange={(e) => setSp1Threshold(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">hari kerja</span>
              <Button size="sm" onClick={() => void saveThreshold(1, sp1Threshold)} disabled={savingLevel === 1}>
                {savingLevel === 1 ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-36 text-sm">Surat Panggilan 2</span>
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                value={sp2Threshold}
                onChange={(e) => setSp2Threshold(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">hari kerja</span>
              <Button size="sm" onClick={() => void saveThreshold(2, sp2Threshold)} disabled={savingLevel === 2}>
                {savingLevel === 2 ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Report Mangkir — Penandatangan Surat</h3>
        <p className="text-sm text-muted-foreground">Nama & jabatan yang muncul di blok tanda tangan Surat Panggilan.</p>
        {thresholdLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 w-64" placeholder="Nama" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            <Input className="h-9 w-48" placeholder="Jabatan" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
            <Button size="sm" onClick={() => void saveSigner()} disabled={savingSigner}>
              {savingSigner ? <Loader2 className="size-4 animate-spin" /> : "Save"}
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
