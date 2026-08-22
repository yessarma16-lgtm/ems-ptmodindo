"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Play, RefreshCw, Search, X } from "lucide-react";
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

const STATUSES: Array<CalculatedStatus | "all"> = ["all", "Sesuai", "Tidak Sesuai", "Dikoreksi Manual", "Cek Manual", "Tidak Berlaku"];
const CALCULATION_JOB_KEY = "mpp-attendance-calculation-job";

function statusLabel(status: CalculatedStatus | "all") {
  const labels: Record<CalculatedStatus | "all", string> = { all: "All statuses", Sesuai: "Match", "Tidak Sesuai": "Mismatch", "Dikoreksi Manual": "Manually Corrected", "Cek Manual": "Manual Review", "Tidak Berlaku": "Not Applicable" };
  return labels[status];
}

function statusVariant(status: CalculatedStatus) {
  if (status === "Sesuai") return "success" as const;
  if (status === "Tidak Sesuai") return "destructive" as const;
  if (status === "Cek Manual") return "warning" as const;
  if (status === "Dikoreksi Manual") return "secondary" as const;
  return "outline" as const;
}

export function CalculationPanel() {
  const [rows, setRows] = useState<CalculatedAttendanceRecord[]>([]);
  const [calculatedCount, setCalculatedCount] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<CalculatedStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [crosscheckProgress, setCrosscheckProgress] = useState<{ processed: number; total: number } | null>(null);
  const [calculateDialogOpen, setCalculateDialogOpen] = useState(false);
  const [calculateFrom, setCalculateFrom] = useState("");
  const [calculateTo, setCalculateTo] = useState("");
  const [calculateController, setCalculateController] = useState<AbortController | null>(null);
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const [selected, setSelected] = useState<CalculatedAttendanceRecord | null>(null);
  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(), [rows]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (department.trim()) params.set("department", department.trim());
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [dateFrom, dateTo, department, search]);

  const visibleRows = useMemo(() => statuses.length === 0 ? rows : rows.filter((row) => statuses.includes(row.status)), [rows, statuses]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/calculation${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load calculation results.");
      setRows(data.rows ?? []);
      setCalculatedCount(data.calculatedCount ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load calculation results.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CALCULATION_JOB_KEY);
      if (!saved) return;
      const job = JSON.parse(saved) as { from?: string; to?: string };
      if (job.from && job.to) {
        setCalculateFrom(job.from);
        setCalculateTo(job.to);
        queueMicrotask(() => void runCrosscheck(job.from!, job.to!));
      }
    } catch {
      localStorage.removeItem(CALCULATION_JOB_KEY);
    }
  }, []);

  async function runCrosscheck(from: string, to: string) {
    setRunning(true);
    setCrosscheckProgress(null);
    const controller = new AbortController();
    setCalculateController(controller);
    try {
      const res = await fetch("/api/attendance/crosscheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFrom: from, dateTo: to, limit: 500 }), signal: controller.signal });
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
      await load();
      if (finalSummary.processed === 500) {
        await runCrosscheck(from, to);
        return;
      }
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

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setDepartment("");
    setSearch("");
    setStatuses([]);
    setSummary(null);
    localStorage.removeItem(CALCULATION_JOB_KEY);
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
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-card py-2">
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={clearFilters} disabled={loading || running}><X />Clear</Button>
          <Button variant="outline" onClick={() => load()} disabled={loading || running}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
          <Button variant="outline" onClick={exportRows} disabled={loading || running}><Download />Export</Button>
          {running && <Button variant="destructive" onClick={() => { localStorage.removeItem(CALCULATION_JOB_KEY); calculateController?.abort(); }}>Cancel Calculate</Button>}
          <Button aria-label="Calculate" onClick={() => setCalculateDialogOpen(true)} disabled={running}><Play />{running ? <Loader2 className="animate-spin" /> : null}{running && crosscheckProgress ? `${crosscheckProgress.processed}/${crosscheckProgress.total} data berhasil di-crosscheck` : "Calculate"}</Button>
        </div>
      </div>

      <div className="text-sm font-medium">Total data MPP Attendance Calculation: {loading ? "—" : visibleRows.length}</div>

      <div className="grid gap-3 md:grid-cols-5">
        <div><label htmlFor="calc-search" className="mb-1 block text-xs font-medium">Name / NIK</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9 pr-9" id="calc-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or NIK" />{search && <button type="button" aria-label="Clear search" title="Clear search" className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}><X className="size-4" /></button>}</div></div>
        <div><label htmlFor="calc-department" className="mb-1 block text-xs font-medium">Department</label><Select value={department || "all"} onValueChange={(value) => setDepartment(value === "all" ? "" : value)}><SelectTrigger id="calc-department"><SelectValue placeholder="All departments" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div><label htmlFor="calc-date-from" className="mb-1 block text-xs font-medium">Date from</label><div className="relative"><Input className="pr-9" id="calc-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />{dateFrom && <button type="button" aria-label="Clear date from" title="Clear date from" className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setDateFrom("")}><X className="size-4" /></button>}</div></div>
        <div><label htmlFor="calc-date-to" className="mb-1 block text-xs font-medium">Date to</label><div className="relative"><Input className="pr-9" id="calc-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />{dateTo && <button type="button" aria-label="Clear date to" title="Clear date to" className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setDateTo("")}><X className="size-4" /></button>}</div></div>
        <div><label className="mb-1 block text-xs font-medium">Status</label><DropdownMenu><DropdownMenuTrigger asChild><Button id="calc-status" variant="outline" className="w-full justify-between">{statuses.length === 0 ? "All statuses" : `${statuses.length} status dipilih`}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-56">{STATUSES.filter((item): item is CalculatedStatus => item !== "all").map((item) => <DropdownMenuCheckboxItem key={item} checked={statuses.includes(item)} onCheckedChange={(checked) => setStatuses((current) => checked ? [...current, item] : current.filter((value) => value !== item))}>{statusLabel(item)}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
      </div>

      {summary && <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">Processed: <strong>{summary.processed}</strong> · Match: <strong>{summary.sesuai}</strong> · Mismatch: <strong>{summary.tidakSesuai}</strong> · Manual review: <strong>{summary.cekManual}</strong> · Manual corrections preserved: <strong>{summary.preservedManualCorrections}</strong></div>}

      <div className="rounded-lg border border-border text-[13px]">
        <Table containerClassName="max-h-[65vh] overflow-auto">
          <TableHeader className="sticky top-0 z-10 bg-background [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background"><TableRow><TableHead>Date</TableHead><TableHead>NIK</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>InTime</TableHead><TableHead>OutTime</TableHead><TableHead>IT1</TableHead><TableHead>OT1</TableHead><TableHead>WHour</TableHead><TableHead>Description</TableHead><TableHead>System OTH</TableHead><TableHead>NK OTH</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={13} className="py-10 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow> : visibleRows.length === 0 ? <TableRow><TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">No calculation results.</TableCell></TableRow> : visibleRows.map((row) => <TableRow key={row.id} onClick={() => setSelected(row)} className="cursor-pointer hover:bg-muted/50" title="Click to edit IT1, OT1, and NK OTH"><TableCell>{row.tanggal}</TableCell><TableCell>{row.nik}</TableCell><TableCell className="font-medium">{row.nama}</TableCell><TableCell>{row.department}</TableCell><TableCell>{row.intime ?? "—"}</TableCell><TableCell>{row.outtime ?? "—"}</TableCell><TableCell>{row.it1 ?? "—"}</TableCell><TableCell>{row.ot1 ?? "—"}</TableCell><TableCell>{row.whour ?? "—"}</TableCell><TableCell>{row.kategori}</TableCell><TableCell>{row.systemCalculatedOth ?? "—"}</TableCell><TableCell className={row.status === "Dikoreksi Manual" ? "font-semibold text-warning" : undefined}>{row.finalOth ?? "—"}</TableCell><TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell></TableRow>)}
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
