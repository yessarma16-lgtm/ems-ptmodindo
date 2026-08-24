"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ActivityLog { id: number; createdAt: string; user: string; activity: string; }
const PAGE_SIZE = 100;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ActivityLogTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pageNumber = page) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/activity-log?page=${pageNumber}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load activity log.");
      setLogs(data.logs ?? []);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? pageNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log.");
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => {
    // Defer the initial request until after the effect has committed. This
    // avoids triggering React's set-state-in-effect lint rule while keeping
    // the initial loading state visible.
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-4">
      <div><CardTitle>Activity Log</CardTitle><CardDescription>Riwayat aktivitas pengguna, dari yang terbaru (maksimal 14 hari).</CardDescription></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>
    </CardHeader>
    <CardContent>
      {error ? <p className="py-8 text-sm text-destructive">{error}</p> : <div className="overflow-x-auto rounded-md border">
        <Table><TableHeader><TableRow><TableHead className="w-16">No</TableHead><TableHead>Tanggal</TableHead><TableHead>User</TableHead><TableHead>Activity</TableHead></TableRow></TableHeader>
          <TableBody>{logs.length === 0 && !loading ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada activity log.</TableCell></TableRow> : logs.map((log, index) => <TableRow key={log.id}><TableCell>{(page - 1) * PAGE_SIZE + index + 1}</TableCell><TableCell className="whitespace-nowrap">{formatDate(log.createdAt)}</TableCell><TableCell>{log.user}</TableCell><TableCell>{log.activity}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>}
      {total > 0 && <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total} record</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Halaman sebelumnya" disabled={page <= 1 || loading} onClick={() => { const next = page - 1; void load(next); }}><ChevronLeft /></Button>
          <span>Halaman {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          <Button variant="outline" size="icon" aria-label="Halaman berikutnya" disabled={page >= Math.ceil(total / PAGE_SIZE) || loading} onClick={() => { const next = page + 1; void load(next); }}><ChevronRight /></Button>
        </div>
      </div>}
    </CardContent>
  </Card>;
}
