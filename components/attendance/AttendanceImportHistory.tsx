"use client";

import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface HistoryEntry {
  sourceFilename: string;
  importedAt: string;
  importedBy: string;
  rowCount: number;
  processStatus: "Done Process" | "Waiting Process";
}

/** Riwayat import ditampilkan sekali per sesi upload, diturunkan dari raw_attendance (bukan tabel terpisah) -- lihat getImportHistory() di AttendanceDatabaseAdapter. */
export function AttendanceImportHistory({ refreshKey }: { refreshKey: number }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    // Tidak ada setState sinkron di badan effect (react-hooks/set-state-in-effect) --
    // `loading` sudah start `true`, pola sama dengan MasterDataManager.tsx.
    queueMicrotask(() => {
      const params = new URLSearchParams(); if (dateFrom) params.set("dateFrom", dateFrom); if (dateTo) params.set("dateTo", dateTo);
      fetch(`/api/attendance/import/history${params.toString() ? `?${params}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => setHistory(data.history ?? []))
        .finally(() => setLoading(false));
    });
  }, [refreshKey, dateFrom, dateTo]);

  async function deleteHistory(h: HistoryEntry) {
    if (!window.confirm(`Delete this import history and ${h.rowCount} rows from ${h.sourceFilename}?`)) return;
    const res = await fetch("/api/attendance/import/history/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(h) });
    if (!res.ok) { toast.error("Failed to delete import history."); return; }
    toast.success("Import history deleted."); setHistory((items) => items.filter((item) => !(item.sourceFilename === h.sourceFilename && item.importedAt === h.importedAt)));
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3"><div><label className="mb-1 block text-xs font-medium">Start date</label><input className="h-9 rounded-md border bg-background px-3 text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div><div><label className="mb-1 block text-xs font-medium">End date</label><input className="h-9 rounded-md border bg-background px-3 text-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div></div>
      {history.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No import history yet.</p> : <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Imported by</TableHead>
            <TableHead>Import Date</TableHead>
            <TableHead className="text-right">Row Count</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((h, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{h.sourceFilename}</TableCell>
              <TableCell>{h.importedBy || "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(h.importedAt).toLocaleString("id-ID")}</TableCell>
              <TableCell className="text-right">{h.rowCount}</TableCell><TableCell><Badge variant={h.processStatus === "Done Process" ? "success" : "warning"}>{h.processStatus}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><a className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" href={`/api/attendance/import/history/download?sourceFilename=${encodeURIComponent(h.sourceFilename)}&importedAt=${encodeURIComponent(h.importedAt)}`} title="Download again"><Download className="size-4" /></a><button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-destructive/10" onClick={() => deleteHistory(h)} title="Delete"><Trash2 className="size-4 text-destructive" /></button></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></div>}
    </div>
  );
}
