"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Play, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorrectionDialog } from "@/components/attendance/CorrectionDialog";
import type { CalculatedAttendanceRecord, CalculatedStatus, CalculationSummary } from "@/lib/database/attendance-types";

const STATUSES: Array<CalculatedStatus | "all"> = ["all", "Sesuai", "Tidak Sesuai", "Dikoreksi Manual", "Cek Manual", "Tidak Berlaku"];

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CalculatedStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const [selected, setSelected] = useState<CalculatedAttendanceRecord | null>(null);
  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(), [rows]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (department.trim()) params.set("department", department.trim());
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [dateFrom, dateTo, department, search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/calculation${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load calculation results.");
      setRows(data.rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load calculation results.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function runCrosscheck() {
    setRunning(true);
    try {
      const res = await fetch("/api/attendance/crosscheck", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to run crosscheck.");
      setSummary(data.summary);
      await load();
      toast.success("Crosscheck completed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run crosscheck.");
    } finally {
      setRunning(false);
    }
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setDepartment("");
    setSearch("");
    setStatus("all");
    setSummary(null);
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
          <Button aria-label="Jalankan Crosscheck" onClick={runCrosscheck} disabled={running}><Play />{running ? <Loader2 className="animate-spin" /> : null}Run Crosscheck</Button>
        </div>
      </div>

      <div className="text-sm font-medium">Total rows: {loading ? "—" : rows.length}</div>

      <div className="grid gap-3 md:grid-cols-5">
        <div><label htmlFor="calc-search" className="mb-1 block text-xs font-medium">Name / NIK</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9 pr-9" id="calc-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or NIK" />{search && <button type="button" aria-label="Clear search" title="Clear search" className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}><X className="size-4" /></button>}</div></div>
        <div><label htmlFor="calc-department" className="mb-1 block text-xs font-medium">Department</label><Select value={department || "all"} onValueChange={(value) => setDepartment(value === "all" ? "" : value)}><SelectTrigger id="calc-department"><SelectValue placeholder="All departments" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div><label htmlFor="calc-date-from" className="mb-1 block text-xs font-medium">Date from</label><Input id="calc-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div><label htmlFor="calc-date-to" className="mb-1 block text-xs font-medium">Date to</label><Input id="calc-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        <div><label htmlFor="calc-status" className="mb-1 block text-xs font-medium">Status</label><Select value={status} onValueChange={(value) => setStatus(value as CalculatedStatus | "all")}><SelectTrigger id="calc-status"><SelectValue>{statusLabel(status)}</SelectValue></SelectTrigger><SelectContent>{STATUSES.map((item) => <SelectItem key={item} value={item}>{statusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
      </div>

      {summary && <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">Processed: <strong>{summary.processed}</strong> · Match: <strong>{summary.sesuai}</strong> · Mismatch: <strong>{summary.tidakSesuai}</strong> · Manual review: <strong>{summary.cekManual}</strong> · Manual corrections preserved: <strong>{summary.preservedManualCorrections}</strong></div>}

      <div className="max-h-[65vh] overflow-auto rounded-lg border border-border text-[13px]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>Name</TableHead><TableHead>NIK</TableHead><TableHead>Department</TableHead><TableHead>Date</TableHead><TableHead>InTime</TableHead><TableHead>OutTime</TableHead><TableHead>IT1</TableHead><TableHead>OT1</TableHead><TableHead>WHour</TableHead><TableHead>Description</TableHead><TableHead>System OTH</TableHead><TableHead>NK OTH</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={13} className="py-10 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">No calculation results.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id} onClick={() => setSelected(row)} className="cursor-pointer hover:bg-muted/50" title="Click to edit IT1, OT1, and NK OTH"><TableCell className="font-medium">{row.nama}</TableCell><TableCell>{row.nik}</TableCell><TableCell>{row.department}</TableCell><TableCell>{row.tanggal}</TableCell><TableCell>{row.intime ?? "—"}</TableCell><TableCell>{row.outtime ?? "—"}</TableCell><TableCell>{row.it1 ?? "—"}</TableCell><TableCell>{row.ot1 ?? "—"}</TableCell><TableCell>{row.whour ?? "—"}</TableCell><TableCell>{row.kategori}</TableCell><TableCell>{row.systemCalculatedOth ?? "—"}</TableCell><TableCell className={row.status === "Dikoreksi Manual" ? "font-semibold text-warning" : undefined}>{row.finalOth ?? "—"}</TableCell><TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>

      <CorrectionDialog key={selected?.id ?? "closed"} row={selected} open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} onSaved={load} />
    </div>
  );
}
