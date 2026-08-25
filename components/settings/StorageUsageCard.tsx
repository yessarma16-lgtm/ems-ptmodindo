"use client";

import { useEffect, useState } from "react";
import { HardDrive, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface UsageResponse {
  bytes: number;
  limitBytes: number;
}

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function StorageUsageCard() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/database/usage", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load storage usage.");
      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load storage usage.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const percent = usage ? Math.min(100, (usage.bytes / usage.limitBytes) * 100) : 0;
  const barColor = percent >= 90 ? "bg-destructive" : percent >= 70 ? "bg-warning" : "bg-primary";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HardDrive className="size-4" />Storage Usage</CardTitle>
        <CardDescription>Supabase Postgres database size vs. the free tier limit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load}><RefreshCw className="size-3.5" />Retry</Button>
          </div>
        ) : usage ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Used</span>
              <span className="font-medium">{formatMb(usage.bytes)} MB / {formatMb(usage.limitBytes)} MB</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percent.toFixed(1)}% of free tier used</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={load}><RefreshCw className="size-3.5" />Refresh</Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
