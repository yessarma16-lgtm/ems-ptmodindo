"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ImportRowOutcome {
  row: number;
  name: string;
}
interface ImportRowError extends ImportRowOutcome {
  message: string;
}
interface ImportResult {
  created: ImportRowOutcome[];
  errors: ImportRowError[];
}
interface ImportProgress {
  totalRows: number;
  processedRows: number;
  createdCount: number;
  errorCount: number;
}

/** Import button + dialog, shared by the Active and Inactive Employees pages — a new row's STATUS column decides which list it ends up in. */
export function ImportEmployeesDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
    setProgress(null);
    setDragOver(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      toast.error("Please choose an .xls or .xlsx file.");
      return;
    }
    setFile(f);
    setResult(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setProgress(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/employees/import", { method: "POST", body });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to import file.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let finalResult: ImportResult | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        let newlineIndex = buffered.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffered.slice(0, newlineIndex).trim();
          buffered = buffered.slice(newlineIndex + 1);
          newlineIndex = buffered.indexOf("\n");
          if (!line) continue;

          const event = JSON.parse(line);
          if (event.type === "progress") {
            setProgress({
              totalRows: event.totalRows,
              processedRows: event.processedRows,
              createdCount: event.createdCount,
              errorCount: event.errorCount,
            });
          } else if (event.type === "done") {
            finalResult = event.result as ImportResult;
          } else if (event.type === "error") {
            streamError = event.message;
          }
        }
      }

      if (streamError) {
        toast.error(streamError);
        return;
      }
      if (finalResult) {
        setResult(finalResult);
        if (finalResult.created.length > 0) {
          toast.success(`${finalResult.created.length} employee${finalResult.created.length === 1 ? "" : "s"} imported.`);
          router.refresh();
        }
      }
    } catch {
      toast.error("Unable to connect to Employee Database.");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="icon" title="Import Employees" onClick={() => setOpen(true)}>
        <Upload />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Employees</DialogTitle>
            <DialogDescription>
              Upload an .xls or .xlsx file to add multiple employees at once. Column headers must match the sample
              template.
            </DialogDescription>
          </DialogHeader>

          <Link
            href="/api/employees/import/template"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Download className="size-4" />
            Download sample template
          </Link>

          <div
            onDragOver={(e) => {
              if (importing) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={importing ? undefined : handleDrop}
            onClick={() => !importing && inputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              importing ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={importing}
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {file ? (
              <>
                <FileSpreadsheet className="size-8 text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">Click or drop to choose a different file</p>
              </>
            ) : (
              <>
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drag & drop your .xls or .xlsx file here</p>
                <p className="text-xs text-muted-foreground">or click to browse</p>
              </>
            )}
          </div>

          {importing && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              {progress ? (
                <div className="flex-1 space-y-1.5">
                  <p>
                    Mengimpor {progress.processedRows}/{progress.totalRows} baris — {progress.createdCount} berhasil
                    {progress.errorCount > 0 ? `, ${progress.errorCount} gagal` : ""}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${progress.totalRows > 0 ? (progress.processedRows / progress.totalRows) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">Membaca file...</span>
              )}
            </div>
          )}

          {result && (
            <div className="max-h-60 space-y-3 overflow-y-auto rounded-lg border border-border p-3 text-sm">
              <div>
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-4" />
                  {result.created.length} row{result.created.length === 1 ? "" : "s"} imported successfully
                </div>
                {result.created.length > 0 && (
                  <ul className="ml-6 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {result.created.map((r, idx) => (
                      <li key={idx}>
                        Row {r.row}: {r.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {result.errors.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="size-4" />
                    {result.errors.length} row{result.errors.length === 1 ? "" : "s"} failed
                  </div>
                  <ul className="ml-6 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {result.errors.map((e, idx) => (
                      <li key={idx}>
                        Row {e.row} ({e.name}): {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
              Close
            </Button>
            <Button type="button" onClick={handleImport} disabled={!file || importing}>
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
