"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AttendanceImportHistory } from "@/components/attendance/AttendanceImportHistory";
import { cn } from "@/lib/utils";

interface RawAttendanceInputShape {
  nik: string; nama: string; department: string; tanggal: string;
  intime: string | null; outtime: string | null; it1: string | null; ot1: string | null;
  whour: number | null; bhour: number | null; othourRecorded: number | null;
  kategori: string;
}
interface PreviewValidRow { rowNumber: number; key: string; input: RawAttendanceInputShape }
interface PreviewConflict { rowNumber: number; key: string; existing: RawAttendanceInputShape & { id: number }; incoming: RawAttendanceInputShape }
interface PreviewRejected { rowNumber: number; reason: string }
interface ImportPreview {
  sourceFilename: string;
  validRows: PreviewValidRow[];
  conflicts: PreviewConflict[];
  rejected: PreviewRejected[];
}
type Decision = "overwrite" | "skip";

interface FinalSummary {
  newCount: number;
  overwrittenCount: number;
  skippedCount: number;
  rejected: PreviewRejected[];
}

export function AttendanceImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setDecisions({});
    setSummary(null);
    setDragOver(false);
  }

  async function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      toast.error("Please select an .xls or .xlsx file.");
      return;
    }
    setFile(f);
    setSummary(null);
    setPreview(null);
    setParsing(true);
    try {
      const body = new FormData();
      body.append("file", f);
      const res = await fetch("/api/attendance/import/preview", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to read the file.");
        return;
      }
      const p: ImportPreview = data.preview;
      setPreview(p);
      // Default keputusan konflik: "skip" (aman) -- user harus sadar pilih Timpa.
      const initialDecisions: Record<string, Decision> = {};
      for (const c of p.conflicts) initialDecisions[c.key] = "skip";
      setDecisions(initialDecisions);
    } catch {
      toast.error("Unable to connect to the server.");
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function setDecision(key: string, decision: Decision) {
    setDecisions((d) => ({ ...d, [key]: decision }));
  }
  function setAllDecisions(decision: Decision) {
    if (!preview) return;
    const next: Record<string, Decision> = {};
    for (const c of preview.conflicts) next[c.key] = decision;
    setDecisions(next);
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    try {
      const rows = [...preview.validRows.map((v) => v.input), ...preview.conflicts.map((c) => c.incoming)];
      const res = await fetch("/api/attendance/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFilename: preview.sourceFilename, rows, decisions }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save imported data.");
        return;
      }
      const overwrittenCount = preview.conflicts.filter((c) => decisions[c.key] === "overwrite").length;
      const skippedCount = preview.conflicts.filter((c) => decisions[c.key] === "skip").length;
      setSummary({
        newCount: preview.validRows.length,
        overwrittenCount,
        skippedCount,
        rejected: preview.rejected,
      });
      toast.success("Import completed.");
      setHistoryRefreshKey((k) => k + 1);
      setFile(null);
      setPreview(null);
    } catch {
      toast.error("Unable to connect to the server.");
    } finally {
      setCommitting(false);
    }
  }

  const hasUnresolvedConflict = preview?.conflicts.some((c) => !decisions[c.key]) ?? false;

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { if (!parsing) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={parsing ? undefined : handleDrop}
        onClick={() => !parsing && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          parsing ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={parsing}
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {parsing ? (
          <>
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Reading file...</p>
          </>
        ) : file ? (
          <>
            <FileSpreadsheet className="size-6 text-primary" />
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">Click or drop to replace the file</p>
          </>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drag & drop an attendance .xls or .xlsx file here</p>
            <p className="text-xs text-muted-foreground">or click to choose a file</p>
          </>
        )}
      </div>

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="success">{preview.validRows.length} valid rows</Badge>
            {preview.conflicts.length > 0 && <Badge variant="warning">{preview.conflicts.length} conflicts</Badge>}
            {preview.rejected.length > 0 && <Badge variant="destructive">{preview.rejected.length} rejected</Badge>}
          </div>

          {preview.rejected.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-destructive">
                <XCircle className="size-4" />
                Rejected rows
              </div>
              <ul className="ml-6 list-disc space-y-0.5 text-xs text-muted-foreground">
                {preview.rejected.map((r, idx) => (
                  <li key={idx}>Row {r.rowNumber}: {r.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.conflicts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="size-4" />
                  {preview.conflicts.length} rows (NIK + date) already exist in the database
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAllDecisions("overwrite")}>Overwrite All</Button>
                  <Button size="sm" variant="outline" onClick={() => setAllDecisions("skip")}>Skip All</Button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Previous Value</TableHead>
                      <TableHead>New Value</TableHead>
                      <TableHead className="text-right">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.conflicts.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="font-medium">{c.incoming.nama}</TableCell>
                        <TableCell>{c.incoming.tanggal}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.existing.intime}–{c.existing.outtime} / IT1 {c.existing.it1} / OT1 {c.existing.ot1} / {c.existing.kategori}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.incoming.intime}–{c.incoming.outtime} / IT1 {c.incoming.it1} / OT1 {c.incoming.ot1} / {c.incoming.kategori}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant={decisions[c.key] === "overwrite" ? "default" : "outline"}
                              onClick={() => setDecision(c.key, "overwrite")}
                            >
                              Overwrite
                            </Button>
                            <Button
                              size="sm"
                              variant={decisions[c.key] === "skip" ? "default" : "outline"}
                              onClick={() => setDecision(c.key, "skip")}
                            >
                              Skip
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={committing}>Cancel</Button>
            <Button onClick={handleCommit} disabled={committing || hasUnresolvedConflict}>
              {committing ? <Loader2 className="animate-spin" /> : <Upload />}
              Confirm Import
            </Button>
          </div>
        </div>
      )}

      {summary && (
        <div className="rounded-lg border border-border p-4 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="size-4" />
            Import completed
          </div>
          <ul className="space-y-1 text-muted-foreground">
            <li>{summary.newCount} new rows imported</li>
            <li>{summary.overwrittenCount} rows overwritten</li>
            <li>{summary.skippedCount} rows skipped</li>
            <li>{summary.rejected.length} rows rejected</li>
          </ul>
          {summary.rejected.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="mb-1 text-xs font-medium text-destructive">Rejection reasons</div>
              <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
                {summary.rejected.map((r, idx) => (
                  <li key={`${r.rowNumber}-${idx}`}>Row {r.rowNumber}: {r.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Import History</h3>
        <AttendanceImportHistory refreshKey={historyRefreshKey} />
      </div>
    </div>
  );
}
