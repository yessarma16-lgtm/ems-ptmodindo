"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorrectionDialog } from "@/components/attendance/CorrectionDialog";
import type { CalculatedAttendanceRecord, CalculatedStatus, CalculationSummary } from "@/lib/database/attendance-types";

const STATUSES: Array<CalculatedStatus | "all"> = ["all", "Sesuai", "Tidak Sesuai", "Dikoreksi Manual", "Cek Manual", "Tidak Berlaku"];

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
  const [status, setStatus] = useState<CalculatedStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const [selected, setSelected] = useState<CalculatedAttendanceRecord | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (department.trim()) params.set("department", department.trim());
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [dateFrom, dateTo, department, status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/calculation${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat hasil crosscheck.");
      setRows(data.rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat hasil crosscheck.");
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
      if (!res.ok) throw new Error(data.error ?? "Gagal menjalankan crosscheck.");
      setSummary(data.summary);
      await load();
      toast.success("Crosscheck selesai.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menjalankan crosscheck.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardCheck className="size-5" />MPP Attendance Calculation</h2>
          <p className="text-sm text-muted-foreground">Crosscheck hanya memproses data yang belum dihitung. Koreksi manual tidak ditimpa saat re-run.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()} disabled={loading || running}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
          <Button onClick={runCrosscheck} disabled={running}><Play />{running ? <Loader2 className="animate-spin" /> : null}Jalankan Crosscheck</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div><label htmlFor="calc-date-from" className="mb-1 block text-xs font-medium">Tanggal dari</label><Input id="calc-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div><label htmlFor="calc-date-to" className="mb-1 block text-xs font-medium">Tanggal sampai</label><Input id="calc-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        <div><label htmlFor="calc-department" className="mb-1 block text-xs font-medium">Department</label><Input id="calc-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Semua department" /></div>
        <div><label htmlFor="calc-status" className="mb-1 block text-xs font-medium">Status</label><Select value={status} onValueChange={(value) => setStatus(value as CalculatedStatus | "all")}><SelectTrigger id="calc-status"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((item) => <SelectItem key={item} value={item}>{item === "all" ? "Semua status" : item}</SelectItem>)}</SelectContent></Select></div>
      </div>

      {summary && <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">Diproses: <strong>{summary.processed}</strong> · Sesuai: <strong>{summary.sesuai}</strong> · Tidak Sesuai: <strong>{summary.tidakSesuai}</strong> · Cek Manual: <strong>{summary.cekManual}</strong> · Koreksi manual dipertahankan: <strong>{summary.preservedManualCorrections}</strong></div>}

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>NIK</TableHead><TableHead>Nama</TableHead><TableHead>Department</TableHead><TableHead>System OTH</TableHead><TableHead>Final OTH</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Belum ada hasil crosscheck.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id} onClick={() => row.status === "Tidak Sesuai" && setSelected(row)} className={row.status === "Tidak Sesuai" ? "cursor-pointer hover:bg-destructive/5" : undefined} title={row.status === "Tidak Sesuai" ? "Klik untuk koreksi" : undefined}><TableCell>{row.tanggal}</TableCell><TableCell>{row.nik}</TableCell><TableCell className="font-medium">{row.nama}</TableCell><TableCell>{row.department}</TableCell><TableCell>{row.systemCalculatedOth ?? "—"}</TableCell><TableCell className={row.status === "Dikoreksi Manual" ? "font-semibold text-warning" : undefined}>{row.finalOth ?? "—"}</TableCell><TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>

      <CorrectionDialog key={selected?.id ?? "closed"} row={selected} open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} onSaved={load} />
    </div>
  );
}
