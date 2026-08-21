"use client";

import { useEffect, useState } from "react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface HistoryEntry {
  sourceFilename: string;
  importedAt: string;
  importedBy: string;
  rowCount: number;
}

/** Riwayat import ditampilkan sekali per sesi upload, diturunkan dari raw_attendance (bukan tabel terpisah) -- lihat getImportHistory() di AttendanceDatabaseAdapter. */
export function AttendanceImportHistory({ refreshKey }: { refreshKey: number }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    // Tidak ada setState sinkron di badan effect (react-hooks/set-state-in-effect) --
    // `loading` sudah start `true`, pola sama dengan MasterDataManager.tsx.
    queueMicrotask(() => {
      fetch("/api/attendance/import/history", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => setHistory(data.history ?? []))
        .finally(() => setLoading(false));
    });
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada riwayat import.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Diimpor oleh</TableHead>
            <TableHead>Kapan</TableHead>
            <TableHead className="text-right">Jumlah Baris</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((h, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{h.sourceFilename}</TableCell>
              <TableCell>{h.importedBy || "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(h.importedAt).toLocaleString("id-ID")}</TableCell>
              <TableCell className="text-right">{h.rowCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
