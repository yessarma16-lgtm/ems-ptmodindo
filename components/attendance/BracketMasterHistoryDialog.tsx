"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { DayType } from "@/lib/attendance/day-type";

interface HistoryRow {
  id: number;
  bracketMasterId: number;
  dayType: DayType;
  durasiStart: number | null;
  durasiEnd: number | null;
  otHours: number | null;
  changedBy: string;
  changedAt: string;
  changeType: "created" | "updated" | "deleted";
}

interface BracketRow {
  id: number;
  dayType: DayType;
  durasiStart: number;
  durasiEnd: number;
  otHours: number;
}

interface BracketMasterHistoryDialogProps {
  dayType: DayType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatValue(row: { durasiStart: number | null; durasiEnd: number | null; otHours: number | null } | null): string {
  if (!row || row.durasiStart == null || row.durasiEnd == null || row.otHours == null) return "—";
  return `${row.durasiStart}–${row.durasiEnd} jam -> OT ${row.otHours} jam`;
}

const CHANGE_TYPE_LABEL: Record<HistoryRow["changeType"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  created: { label: "Dibuat", variant: "success" },
  updated: { label: "Diubah", variant: "warning" },
  deleted: { label: "Dihapus", variant: "destructive" },
};

/**
 * bracket_master_history hanya menyimpan snapshot nilai LAMA. "Nilai baru"
 * diturunkan di sini: untuk entry bukan yang terakhir, itu adalah nilai LAMA
 * dari entry berikutnya (urut waktu) untuk bracket_master_id yang sama;
 * untuk entry terakhir, itu adalah baris bracket_master yang masih hidup
 * sekarang (kalau belum dihapus) atau "(dihapus)".
 */
function deriveNewValues(history: HistoryRow[], liveById: Map<number, BracketRow>): Map<number, string> {
  const byBracket = new Map<number, HistoryRow[]>();
  for (const h of history) {
    const list = byBracket.get(h.bracketMasterId) ?? [];
    list.push(h);
    byBracket.set(h.bracketMasterId, list);
  }

  const newValueByHistoryId = new Map<number, string>();
  for (const [bracketMasterId, entries] of byBracket) {
    const sorted = [...entries].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const next = sorted[i + 1];
      if (next) {
        newValueByHistoryId.set(entry.id, formatValue(next));
      } else {
        const live = liveById.get(bracketMasterId);
        newValueByHistoryId.set(entry.id, live ? formatValue(live) : "(dihapus)");
      }
    }
  }
  return newValueByHistoryId;
}

export function BracketMasterHistoryDialog({ dayType, open, onOpenChange }: BracketMasterHistoryDialogProps) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [liveById, setLiveById] = useState<Map<number, BracketRow>>(new Map());

  useEffect(() => {
    if (!open) return;
    // Tidak ada setState sinkron di badan effect (react-hooks/set-state-in-effect) --
    // `loading` sudah start `true`, pola sama dengan MasterDataManager.tsx.
    queueMicrotask(() => {
      Promise.all([
        fetch("/api/attendance/bracket-master/history", { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/attendance/bracket-master?dayType=${encodeURIComponent(dayType)}`, { cache: "no-store" }).then((r) => r.json()),
      ])
        .then(([historyData, liveData]) => {
          const rows: HistoryRow[] = (historyData.history ?? []).filter((h: HistoryRow) => h.dayType === dayType);
          setHistory(rows);
          const live: BracketRow[] = liveData.rows ?? [];
          setLiveById(new Map(live.map((r) => [r.id, r])));
        })
        .finally(() => setLoading(false));
    });
  }, [open, dayType]);

  const newValueByHistoryId = deriveNewValues(history, liveById);
  const sortedDesc = [...history].sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Riwayat Perubahan — {dayType}</DialogTitle>
          <DialogDescription>Read-only. Diurutkan dari yang terbaru.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : sortedDesc.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat perubahan untuk {dayType}.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Nilai Lama</TableHead>
                  <TableHead>Nilai Baru</TableHead>
                  <TableHead>Oleh</TableHead>
                  <TableHead>Kapan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDesc.map((h) => {
                  const meta = CHANGE_TYPE_LABEL[h.changeType];
                  return (
                    <TableRow key={h.id}>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatValue(h)}</TableCell>
                      <TableCell className="text-sm">{newValueByHistoryId.get(h.id)}</TableCell>
                      <TableCell className="text-sm">{h.changedBy || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(h.changedAt).toLocaleString("id-ID")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
