"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ActivityLog { id: number; createdAt: string; user: string; activity: string; }

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ActivityLogTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/activity-log", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load activity log.");
      setLogs(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    // Defer the initial request until after the effect has committed. This
    // avoids triggering React's set-state-in-effect lint rule while keeping
    // the initial loading state visible.
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-4">
      <div><CardTitle>Activity Log</CardTitle><CardDescription>Riwayat aktivitas pengguna, dari yang terbaru.</CardDescription></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>
    </CardHeader>
    <CardContent>
      {error ? <p className="py-8 text-sm text-destructive">{error}</p> : <div className="overflow-x-auto rounded-md border">
        <Table><TableHeader><TableRow><TableHead className="w-16">No</TableHead><TableHead>Tanggal</TableHead><TableHead>User</TableHead><TableHead>Activity</TableHead></TableRow></TableHeader>
          <TableBody>{logs.length === 0 && !loading ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada activity log.</TableCell></TableRow> : logs.map((log, index) => <TableRow key={log.id}><TableCell>{index + 1}</TableCell><TableCell className="whitespace-nowrap">{formatDate(log.createdAt)}</TableCell><TableCell>{log.user}</TableCell><TableCell>{log.activity}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>}
    </CardContent>
  </Card>;
}
