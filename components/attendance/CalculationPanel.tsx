"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Play, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorrectionDialog } from "@/components/attendance/CorrectionDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CalculatedAttendanceRecord, CalculatedStatus, CalculationSummary } from "@/lib/database/attendance-types";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { useCalculationSession } from "@/components/attendance/CalculationSession";

const STATUSES: Array<CalculatedStatus | "all"> = ["all", "Sesuai", "Tidak Sesuai", "Dikoreksi Manual", "Cek Manual", "Tidak Berlaku"];
const CALCULATION_JOB_KEY = "mpp-attendance-calculation-job";

function statusLabel(status: CalculatedStatus | "all") {
  const labels: Record<CalculatedStatus | "all", string> = { all: "All statuses", Sesuai: "Match", "Tidak Sesuai": "Mismatch", "Dikoreksi Manual": "Manually Corrected", "Cek Manual": "Manual Review", "Tidak Berlaku": "Not Applicable" };
  return labels[status];
}

/** Shared shell for the small multi-select checkbox filters (Status / System OTH / EDIT OTH) in the filter bar. */
function CheckboxFilter({
  label,
  count,
  allLabel,
  countLabel,
  onClear,
  children,
}: {
  label: string;
  count: number;
  allLabel: string;
  countLabel: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="relative h-8 w-full justify-between pr-8 text-xs" size="sm">
            {count === 0 ? allLabel : `${count} ${countLabel}`}
            {count > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Clear ${label} filter`}
                title={`Clear ${label} filter`}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); onClear(); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onClear(); } }}
              >
                <X className="size-3.5" />
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">{children}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function statusVariant(status: CalculatedStatus) {
  if (status === "Sesuai") return "success" as const;
  if (status === "Tidak Sesuai") return "destructive" as const;
  if (status === "Cek Manual") return "warning" as const;
  if (status === "Dikoreksi Manual") return "secondary" as const;
  return "outline" as const;
}

export function CalculationPanel() {
  const { rows, setRows, dateFrom, setDateFrom, dateTo, setDateTo, summary, setSummary, clearSession } = useCalculationSession();
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<CalculatedStatus[]>([]);
  const [systemOthFilter, setSystemOthFilter] = useState<number[]>([]);
  const [nkOthFilter, setNkOthFilter] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [crosscheckProgress, setCrosscheckProgress] = useState<{ processed: number; total: number } | null>(null);
  const [calculateDialogOpen, setCalculateDialogOpen] = useState(false);
  const [calculateFrom, setCalculateFrom] = useState("");
  const [calculateTo, setCalculateTo] = useState("");
  const [calculateController, setCalculateController] = useState<AbortController | null>(null);
  const [selected, setSelected] = useState<CalculatedAttendanceRecord | null>(null);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(), [rows]);
  const systemOthValues = useMemo(() => Array.from(new Set(rows.map((row) => row.systemCalculatedOth).filter((v): v is number => v !== null && v !== undefined))).sort((a, b) => a - b), [rows]);
  const nkOthValues = useMemo(() => Array.from(new Set(rows.map((row) => row.finalOth).filter((v): v is number => v !== null && v !== undefined))).sort((a, b) => a - b), [rows]);

  useEffect(() => {
    fetch("/api/attendance/status", { cache: "no-store" }).then((res) => res.json()).then((data) => setProcessedDates(data.processedDates ?? [])).catch(() => setProcessedDates([]));
  }, []);

  async function refreshProcessedDates() {
    try {
      const res = await fetch("/api/attendance/status", { cache: "no-store" });
      const data = await res.json();
      setProcessedDates(data.processedDates ?? []);
    } catch {
      // Keep the current indicators if the refresh request temporarily fails.
    }
  }

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (department.trim()) params.set("department", department.trim());
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [dateFrom, dateTo, department, search]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (statuses.length > 0 && !statuses.includes(row.status)) return false;
    if (department && row.department !== department) return false;
    if (systemOthFilter.length > 0 && (row.systemCalculatedOth === null || row.systemCalculatedOth === undefined || !systemOthFilter.includes(row.systemCalculatedOth))) return false;
    if (nkOthFilter.length > 0 && (row.finalOth === null || row.finalOth === undefined || !nkOthFilter.includes(row.finalOth))) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      if (!`${row.nik} ${row.nama}`.toLowerCase().includes(term)) return false;
    }
    return true;
  }), [rows, statuses, department, systemOthFilter, nkOthFilter, search]);

  const load = useCallback(async (requestedQuery = query, notifyWhenEmpty = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/calculation${requestedQuery ? `?${requestedQuery}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load calculation results.");
      setRows(data.rows ?? []);
      if (notifyWhenEmpty && (data.rows ?? []).length === 0) toast.info("Attendance not yet processed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load calculation results.");
    } finally {
      setLoading(false);
    }
  }, [query, setRows]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CALCULATION_JOB_KEY);
      if (!saved) return;
      const job = JSON.parse(saved) as { from?: string; to?: string };
      if (job.from && job.to) {
        queueMicrotask(() => {
          setCalculateFrom(job.from!);
          setCalculateTo(job.to!);
          void runCrosscheck(job.from!, job.to!);
        });
      }
    } catch {
      localStorage.removeItem(CALCULATION_JOB_KEY);
    }
  // Resume an interrupted job once on mount; the callback intentionally uses the
  // persisted date range rather than the current filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCrosscheck(from: string, to: string) {
    setRunning(true);
    setCrosscheckProgress(null);
    setAiAnalysis(null);
    const controller = new AbortController();
    setCalculateController(controller);
    try {
      const res = await fetch("/api/attendance/crosscheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFrom: from, dateTo: to }), signal: controller.signal });
      if (!res.ok || !res.body) { const data = await res.json().catch(() => null); throw new Error(data?.error ?? "Failed to run crosscheck."); }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSummary: CalculationSummary | null = null;
      let errorMessage: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1); newline = buffer.indexOf("\n");
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") setCrosscheckProgress({ processed: event.processed, total: event.total });
          else if (event.type === "done") finalSummary = event.summary as CalculationSummary;
          else if (event.type === "error") errorMessage = event.message;
        }
      }
      if (controller.signal.aborted) return;
      if (errorMessage) throw new Error(errorMessage);
      if (!finalSummary) throw new Error("Crosscheck tidak mengembalikan hasil.");
      const savedJob = localStorage.getItem(CALCULATION_JOB_KEY);
      const savedProcessed = savedJob ? Number((JSON.parse(savedJob) as { processed?: number }).processed ?? 0) : 0;
      localStorage.setItem(CALCULATION_JOB_KEY, JSON.stringify({ from, to, processed: savedProcessed + finalSummary.processed }));
      setSummary(finalSummary);
      await load(buildQuery(from, to));
      await refreshProcessedDates();
      localStorage.removeItem(CALCULATION_JOB_KEY);
      toast.success("Crosscheck completed.");
    } catch (err) {
      if (controller.signal.aborted) return;
      toast.error(err instanceof Error ? err.message : "Failed to run crosscheck.");
    } finally {
      setRunning(false);
      setCalculateController(null);
      setCalculateDialogOpen(false);
    }
  }

  function confirmCalculate() {
    if (!calculateFrom || !calculateTo) {
      toast.error("Pilih tanggal mulai dan tanggal akhir.");
      return;
    }
    if (calculateFrom > calculateTo) {
      toast.error("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.");
      return;
    }
    localStorage.setItem(CALCULATION_JOB_KEY, JSON.stringify({ from: calculateFrom, to: calculateTo, processed: 0 }));
    setDateFrom(calculateFrom);
    setDateTo(calculateTo);
    setCalculateDialogOpen(false);
    void runCrosscheck(calculateFrom, calculateTo);
  }

  function buildQuery(from: string, to: string) {
    const params = new URLSearchParams();
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    if (department.trim()) params.set("department", department.trim());
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }

  function runFilters() {
    if (!dateFrom || !dateTo) {
      toast.error("Pilih tanggal mulai dan tanggal akhir terlebih dahulu.");
      return;
    }
    if (dateFrom > dateTo) {
      toast.error("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.");
      return;
    }
    setRows([]);
    setSummary(null);
    void load(buildQuery(dateFrom, dateTo), true);
  }

  function clearFilters() {
    clearSession();
    setDepartment("");
    setSearch("");
    setStatuses([]);
    setSystemOthFilter([]);
    setNkOthFilter([]);
    setAiAnalysis(null);
    localStorage.removeItem(CALCULATION_JOB_KEY);
  }

  async function runAnalysis() {
    if (!summary) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const mismatches = rows
        .filter((row) => row.status === "Tidak Sesuai" || row.status === "Cek Manual")
        .slice(0, 200)
        .map((row) => ({ nik: row.nik, nama: row.nama, department: row.department, tanggal: row.tanggal, systemCalculatedOth: row.systemCalculatedOth ?? null, finalOth: row.finalOth ?? null, status: row.status }));
      const res = await fetch("/api/attendance/calculation/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFrom, dateTo, summary, mismatches }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate AI analysis.");
      setAiAnalysis(data.analysis);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate AI analysis.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function exportRows() {
    const res = await fetch(`/api/attendance/calculation/export${query ? `?${query}` : ""}`);
    if (!res.ok) { toast.error("Failed to export calculation data."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "mpp-attendance-calculation.xlsx"; anchor.click(); URL.revokeObjectURL(url);
    toast.success("Calculation data exported.");
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 flex flex-wrap items-end justify-between gap-3 bg-card py-2">
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="mb-1 block text-xs font-medium">Date from</label><AttendanceDatePicker value={dateFrom} onChange={setDateFrom} processedDates={processedDates} /></div>
          <div><label className="mb-1 block text-xs font-medium">Date to</label><AttendanceDatePicker value={dateTo} onChange={setDateTo} processedDates={processedDates} /></div>
          <Button size="sm" onClick={runFilters} disabled={loading || running}><Search />Run</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={clearFilters} disabled={loading || running}><X />Clear</Button>
          <Button variant="outline" onClick={() => load(query, true)} disabled={loading || running || !dateFrom || !dateTo}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
          <Button variant="outline" onClick={exportRows} disabled={loading || running || rows.length === 0}><Download />Export</Button>
          {running && <Button variant="destructive" onClick={() => { localStorage.removeItem(CALCULATION_JOB_KEY); calculateController?.abort(); }}>Cancel Calculate</Button>}
          <Button aria-label="Calculate" onClick={() => setCalculateDialogOpen(true)} disabled={running}><Play />{running ? <Loader2 className="animate-spin" /> : null}{running && crosscheckProgress ? `${crosscheckProgress.processed}/${crosscheckProgress.total} data berhasil di-crosscheck` : "Calculate"}</Button>
        </div>
      </div>


      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
        <div><label htmlFor="calc-search" className="mb-1 block text-xs font-medium">Name / NIK</label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 pl-8 pr-8 text-xs" id="calc-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or NIK" />{search && <button type="button" aria-label="Clear search" title="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}><X className="size-3.5" /></button>}</div></div>
        <div><label htmlFor="calc-department" className="mb-1 block text-xs font-medium">Department</label><Select value={department || "all"} onValueChange={(value) => setDepartment(value === "all" ? "" : value)}><SelectTrigger id="calc-department" className="h-8 text-xs"><SelectValue placeholder="All departments" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <CheckboxFilter label="Status" count={statuses.length} allLabel="All statuses" countLabel="status dipilih" onClear={() => setStatuses([])}>
          {STATUSES.filter((item): item is CalculatedStatus => item !== "all").map((item) => <DropdownMenuCheckboxItem key={item} checked={statuses.includes(item)} onCheckedChange={(checked) => setStatuses((current) => checked ? [...current, item] : current.filter((value) => value !== item))}>{statusLabel(item)}</DropdownMenuCheckboxItem>)}
        </CheckboxFilter>
        <CheckboxFilter label="System OTH" count={systemOthFilter.length} allLabel="All System OTH" countLabel="nilai dipilih" onClear={() => setSystemOthFilter([])}>
          {systemOthValues.map((value) => <DropdownMenuCheckboxItem key={value} checked={systemOthFilter.includes(value)} onCheckedChange={(checked) => setSystemOthFilter((current) => checked ? [...current, value] : current.filter((v) => v !== value))}>{value}</DropdownMenuCheckboxItem>)}
        </CheckboxFilter>
        <CheckboxFilter label="EDIT OTH" count={nkOthFilter.length} allLabel="All EDIT OTH" countLabel="nilai dipilih" onClear={() => setNkOthFilter([])}>
          {nkOthValues.map((value) => <DropdownMenuCheckboxItem key={value} checked={nkOthFilter.includes(value)} onCheckedChange={(checked) => setNkOthFilter((current) => checked ? [...current, value] : current.filter((v) => v !== value))}>{value}</DropdownMenuCheckboxItem>)}
        </CheckboxFilter>
        <div className="flex items-end justify-end text-right text-xs font-medium">Total: {loading ? "—" : visibleRows.length}</div>
      </div>

      {summary && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>Processed: <strong>{summary.processed}</strong> · Match: <strong>{summary.sesuai}</strong> · Mismatch: <strong>{summary.tidakSesuai}</strong> · Manual review: <strong>{summary.cekManual}</strong> · Manual corrections preserved: <strong>{summary.preservedManualCorrections}</strong></div>
            <Button size="sm" variant="outline" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {analyzing ? "Analyzing…" : "Analyze with AI"}
            </Button>
          </div>
          {aiAnalysis && (
            <div className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm">
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5" />AI Analysis</div>
              {aiAnalysis}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border text-[13px]">
        <Table containerClassName="max-h-[65vh] overflow-auto">
          <TableHeader className="sticky top-0 z-10 bg-background [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background"><TableRow><TableHead>Date</TableHead><TableHead>NIK</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>InTime</TableHead><TableHead>OutTime</TableHead><TableHead>IT1</TableHead><TableHead>OT1</TableHead><TableHead>WHour</TableHead><TableHead>OTH</TableHead><TableHead>Description</TableHead><TableHead>System OTH</TableHead><TableHead>EDIT OTH</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={14} className="py-10 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow> : visibleRows.length === 0 ? <TableRow><TableCell colSpan={14} className="py-10 text-center text-sm text-muted-foreground">{dateFrom && dateTo ? "No calculation results." : "Select a date range and click Run."}</TableCell></TableRow> : visibleRows.map((row) => <TableRow key={row.id} onClick={() => setSelected(row)} className="cursor-pointer hover:bg-muted/50" title="Click to edit IT1, OT1, and EDIT OTH"><TableCell>{row.tanggal}</TableCell><TableCell>{row.nik}</TableCell><TableCell className="font-medium">{row.nama}</TableCell><TableCell>{row.department}</TableCell><TableCell>{row.intime ?? "—"}</TableCell><TableCell>{row.outtime ?? "—"}</TableCell><TableCell>{row.it1 ?? "—"}</TableCell><TableCell>{row.ot1 ?? "—"}</TableCell><TableCell>{row.whour ?? "—"}</TableCell><TableCell>{row.othourRecorded ?? "—"}</TableCell><TableCell>{row.kategori}</TableCell><TableCell>{row.systemCalculatedOth ?? "—"}</TableCell><TableCell className={row.status === "Dikoreksi Manual" ? "font-semibold text-warning" : undefined}>{row.finalOth ?? "—"}</TableCell><TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>

      <CorrectionDialog key={selected?.id ?? "closed"} row={selected} open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} onSaved={load} />

      <Dialog open={calculateDialogOpen} onOpenChange={(open) => { if (!running) setCalculateDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Calculate Attendance</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="calculate-from" className="mb-1 block text-xs font-medium">Calculate from</label><Input id="calculate-from" type="date" value={calculateFrom} onChange={(e) => setCalculateFrom(e.target.value)} /></div>
            <div><label htmlFor="calculate-to" className="mb-1 block text-xs font-medium">Calculate to</label><Input id="calculate-to" type="date" value={calculateTo} onChange={(e) => setCalculateTo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCalculateDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={confirmCalculate}>Process Calculation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
