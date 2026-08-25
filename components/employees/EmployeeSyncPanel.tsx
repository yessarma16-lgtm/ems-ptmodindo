"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sheet as SheetIcon, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface SyncFieldDiff { field: string; label: string; oldValue: string; newValue: string }
interface SyncNewRow { rowNumber: number; nik: string; incoming: Record<string, string> }
interface SyncMatchedRow { rowNumber: number; nik: string; recordId: string; incoming: Record<string, string>; diffs: SyncFieldDiff[] }
interface SyncRejectedRow { rowNumber: number; reason: string }
interface EmployeeSyncPreview {
  newRows: SyncNewRow[];
  changedRows: SyncMatchedRow[];
  inactivatedRows: SyncMatchedRow[];
  rejected: SyncRejectedRow[];
  unchangedCount: number;
  warnings: string[];
}
type Decision = "apply" | "skip";
interface CommitSummary {
  createdCount: number;
  updatedCount: number;
  movedToInactiveCount: number;
  skippedCount: number;
  errors: { rowNumber: number; nik: string; message: string }[];
}

/** Pull-sync from the "Employee Sync" Google Sheet tab into Active/Inactive Employees — see lib/employee-sync.ts for the diff engine this drives. */
export function EmployeeSyncPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<EmployeeSyncPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [summary, setSummary] = useState<CommitSummary | null>(null);

  function reset() {
    setPreview(null);
    setDecisions({});
    setSummary(null);
    setProgress(null);
  }

  async function fetchPreview() {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch("/api/employees/sync/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to read the sync sheet.");
        setOpen(false);
        return;
      }
      const p: EmployeeSyncPreview = data.preview;
      setPreview(p);
      // Default: skip everything, so nothing is applied until the admin deliberately approves each row.
      const initial: Record<string, Decision> = {};
      for (const r of p.newRows) initial[r.nik] = "skip";
      for (const r of p.changedRows) initial[r.nik] = "skip";
      for (const r of p.inactivatedRows) initial[r.nik] = "skip";
      setDecisions(initial);
    } catch {
      toast.error("Unable to connect to the server.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    reset();
    void fetchPreview();
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function setDecision(nik: string, decision: Decision) {
    setDecisions((d) => ({ ...d, [nik]: decision }));
  }
  function setGroupDecisions(niks: string[], decision: Decision) {
    setDecisions((d) => {
      const next = { ...d };
      for (const nik of niks) next[nik] = decision;
      return next;
    });
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    setProgress(null);
    try {
      const res = await fetch("/api/employees/sync/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newRows: preview.newRows,
          changedRows: preview.changedRows,
          inactivatedRows: preview.inactivatedRows,
          decisions,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to sync employee data.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let finalSummary: CommitSummary | null = null;
      let streamError: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let newline = buffered.indexOf("\n");
        while (newline >= 0) {
          const line = buffered.slice(0, newline).trim();
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf("\n");
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") setProgress({ processed: event.processed, total: event.total });
          else if (event.type === "done") finalSummary = event.summary as CommitSummary;
          else if (event.type === "error") streamError = event.message;
        }
      }
      if (streamError) { toast.error(streamError); return; }
      if (!finalSummary) { toast.error("Sync did not return a result."); return; }
      setSummary(finalSummary);
      setPreview(null);
      if (finalSummary.createdCount + finalSummary.updatedCount + finalSummary.movedToInactiveCount > 0) {
        toast.success("Employee sync completed.");
        router.refresh();
      }
    } catch {
      toast.error("Unable to connect to the server.");
    } finally {
      setCommitting(false);
    }
  }

  const totalRows = preview ? preview.newRows.length + preview.changedRows.length + preview.inactivatedRows.length : 0;
  const hasUndecidedRow = preview
    ? [...preview.newRows, ...preview.changedRows, ...preview.inactivatedRows].some((r) => !decisions[r.nik])
    : false;

  function DecisionButtons({ nik }: { nik: string }) {
    return (
      <div className="inline-flex gap-1">
        <Button size="sm" variant={decisions[nik] === "apply" ? "default" : "outline"} onClick={() => setDecision(nik, "apply")}>Apply</Button>
        <Button size="sm" variant={decisions[nik] === "skip" ? "default" : "outline"} onClick={() => setDecision(nik, "skip")}>Skip</Button>
      </div>
    );
  }

  function DiffList({ diffs }: { diffs: SyncFieldDiff[] }) {
    return (
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {diffs.map((d) => (
          <li key={d.field}>
            <span className="font-medium text-foreground">{d.label}:</span> {d.oldValue || "(blank)"} → {d.newValue || "(blank)"}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={handleOpen}>
        <SheetIcon />
        Update Data
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sync from Google Sheet</DialogTitle>
            <DialogDescription>Review every difference between the &quot;Employee Sync&quot; sheet and the dashboard before applying anything.</DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading the sync sheet…
            </div>
          )}

          {preview && (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2 text-sm">
                {preview.newRows.length > 0 && <Badge variant="success">{preview.newRows.length} new</Badge>}
                {preview.changedRows.length > 0 && <Badge variant="warning">{preview.changedRows.length} changed</Badge>}
                {preview.inactivatedRows.length > 0 && <Badge variant="destructive">{preview.inactivatedRows.length} moving to inactive</Badge>}
                {preview.rejected.length > 0 && <Badge variant="outline">{preview.rejected.length} rejected</Badge>}
                <Badge variant="secondary">{preview.unchangedCount} already in sync</Badge>
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                  {preview.warnings.map((w, idx) => <p key={idx}>{w}</p>)}
                </div>
              )}

              {totalRows === 0 && preview.rejected.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing to sync — the sheet matches the dashboard.</p>
              )}

              {preview.newRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-success">New employees</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setGroupDecisions(preview.newRows.map((r) => r.nik), "apply")}>Apply all</Button>
                      <Button size="sm" variant="outline" onClick={() => setGroupDecisions(preview.newRows.map((r) => r.nik), "skip")}>Skip all</Button>
                    </div>
                  </div>
                  {preview.newRows.map((r) => (
                    <div key={r.nik} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{r.incoming.name} <span className="font-normal text-muted-foreground">({r.nik})</span></p>
                        <p className="text-xs text-muted-foreground">{r.incoming.department} · {r.incoming.position}</p>
                      </div>
                      <DecisionButtons nik={r.nik} />
                    </div>
                  ))}
                </div>
              )}

              {preview.changedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-warning">Changed</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setGroupDecisions(preview.changedRows.map((r) => r.nik), "apply")}>Apply all</Button>
                      <Button size="sm" variant="outline" onClick={() => setGroupDecisions(preview.changedRows.map((r) => r.nik), "skip")}>Skip all</Button>
                    </div>
                  </div>
                  {preview.changedRows.map((r) => (
                    <div key={r.nik} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{r.incoming.name} <span className="font-normal text-muted-foreground">({r.nik})</span></p>
                        <DiffList diffs={r.diffs} />
                      </div>
                      <DecisionButtons nik={r.nik} />
                    </div>
                  ))}
                </div>
              )}

              {preview.inactivatedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-destructive">Moving to Inactive</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setGroupDecisions(preview.inactivatedRows.map((r) => r.nik), "apply")}>Apply all</Button>
                      <Button size="sm" variant="outline" onClick={() => setGroupDecisions(preview.inactivatedRows.map((r) => r.nik), "skip")}>Skip all</Button>
                    </div>
                  </div>
                  {preview.inactivatedRows.map((r) => (
                    <div key={r.nik} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{r.incoming.name} <span className="font-normal text-muted-foreground">({r.nik})</span></p>
                        <DiffList diffs={r.diffs} />
                      </div>
                      <DecisionButtons nik={r.nik} />
                    </div>
                  ))}
                </div>
              )}

              {preview.rejected.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-destructive">
                    <XCircle className="size-4" />
                    Rejected rows
                  </div>
                  <ul className="ml-6 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {preview.rejected.map((r, idx) => <li key={idx}>Row {r.rowNumber}: {r.reason}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {summary && (
            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium text-success">
                <CheckCircle2 className="size-4" />
                Sync completed
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>{summary.createdCount} new employees created</li>
                <li>{summary.updatedCount} employees updated</li>
                <li>{summary.movedToInactiveCount} moved to Inactive</li>
                <li>{summary.skippedCount} rows skipped</li>
              </ul>
              {summary.errors.length > 0 && (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-destructive"><AlertTriangle className="size-3.5" />Errors</div>
                  <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {summary.errors.map((e, idx) => <li key={idx}>Row {e.rowNumber} ({e.nik}): {e.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={committing}>Close</Button>
            {preview && totalRows > 0 && (
              <Button type="button" onClick={handleCommit} disabled={committing || hasUndecidedRow}>
                {committing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {committing && progress ? `${progress.processed}/${progress.total} applied` : "Confirm Sync"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
