"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReportKind = "employee" | "department" | "exceptions";

async function downloadResponse(response: Response, fallback: string) {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallback;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AttendanceReportPanel() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [generating, setGenerating] = useState<ReportKind | null>(null);

  async function generate(kind: ReportKind) {
    if (generating) return;
    setGenerating(kind);
    try {
      const res = await fetch("/api/attendance/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, filters: { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, department: department.trim() || undefined } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Gagal membuat report.");
      }
      await downloadResponse(res, `attendance-${kind}.xlsx`);
      toast.success("Report berhasil di-download.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat report.");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div><label htmlFor="report-date-from" className="mb-1 block text-xs font-medium">Tanggal dari</label><Input id="report-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div><label htmlFor="report-date-to" className="mb-1 block text-xs font-medium">Tanggal sampai</label><Input id="report-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        <div><label htmlFor="report-department" className="mb-1 block text-xs font-medium">Department</label><Input id="report-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Semua department" /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ReportButton label="Rekap per karyawan" kind="employee" generating={generating} onClick={generate} />
        <ReportButton label="Rekap per departemen" kind="department" generating={generating} onClick={generate} />
        <ReportButton label="Laporan eksepsi" kind="exceptions" generating={generating} onClick={generate} />
      </div>
      <p className="text-xs text-muted-foreground">Semua total menggunakan Final OTH. Laporan eksepsi hanya memuat status Tidak Sesuai dan Dikoreksi Manual.</p>
    </div>
  );
}

function ReportButton({ label, kind, generating, onClick }: { label: string; kind: ReportKind; generating: ReportKind | null; onClick: (kind: ReportKind) => void }) {
  const active = generating === kind;
  return <Button variant="outline" className="h-auto justify-start p-4" onClick={() => onClick(kind)} disabled={generating !== null}><FileSpreadsheet /> <span className="flex-1 text-left">{label}</span>{active ? <Loader2 className="animate-spin" /> : <Download />}</Button>;
}
