"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, History, Save, RotateCw, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BracketMasterHistoryDialog } from "@/components/attendance/BracketMasterHistoryDialog";
import { cn } from "@/lib/utils";
import type { DayType } from "@/lib/attendance/day-type";

const DAY_TYPES: DayType[] = ["Senin-Jumat", "Sabtu", "Minggu"];

interface ServerRow {
  id: number;
  dayType: DayType;
  durasiStart: number;
  durasiEnd: number;
  otHours: number;
}

interface DraftRow {
  key: string; // id numerik (baris existing) atau "new-N" (baris baru) -- stabil dipakai sebagai React key
  id?: number;
  durasiStart: string;
  durasiEnd: string;
  otHours: string;
  deleted: boolean;
}

function formatDuration(value: number): string {
  const totalMinutes = Math.round(value * 60);
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function parseDuration(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const minutes = Number(timeMatch[2]);
    return minutes < 60 ? Number(timeMatch[1]) + minutes / 60 : Number.NaN;
  }
  return Number(trimmed);
}

function toDraft(row: ServerRow): DraftRow {
  return { key: String(row.id), id: row.id, durasiStart: formatDuration(row.durasiStart), durasiEnd: formatDuration(row.durasiEnd), otHours: String(row.otHours), deleted: false };
}

let newRowCounter = 0;

/** Baris berubah kalau salah satu angkanya beda dari snapshot server, atau memang baru/dihapus. */
function rowStatus(draft: DraftRow, original: ServerRow | undefined): "new" | "deleted" | "changed" | "unchanged" {
  if (draft.deleted) return "deleted";
  if (!original) return "new";
  if (
    parseDuration(draft.durasiStart) !== original.durasiStart ||
    parseDuration(draft.durasiEnd) !== original.durasiEnd ||
    Number(draft.otHours) !== original.otHours
  ) {
    return "changed";
  }
  return "unchanged";
}

export function BracketMasterManager() {
  const [dayType, setDayType] = useState<DayType>("Senin-Jumat");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverRows, setServerRows] = useState<ServerRow[]>([]);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance/bracket-master?dayType=${encodeURIComponent(dayType)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat tabel bracket.");
      const rows: ServerRow[] = data.rows ?? [];
      setServerRows(rows);
      setDraftRows(rows.map(toDraft));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat tabel bracket.");
    } finally {
      setLoading(false);
    }
  }, [dayType]);

  useEffect(() => {
    // Tidak ada setState sinkron di badan effect (react-hooks/set-state-in-effect) --
    // `loading` sudah start `true`, pola sama dengan MasterDataManager.tsx;
    // handleDayTypeChange men-set loading=true sendiri sebelum trigger effect ini.
    queueMicrotask(load);
  }, [load]);

  const originalById = useMemo(() => new Map(serverRows.map((r) => [r.id, r])), [serverRows]);

  function handleDayTypeChange(value: string) {
    setLoading(true);
    setDayType(value as DayType);
  }

  function updateField(key: string, field: "durasiStart" | "durasiEnd" | "otHours", value: string) {
    setDraftRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    newRowCounter += 1;
    setDraftRows((rows) => [...rows, { key: `new-${newRowCounter}`, durasiStart: "", durasiEnd: "", otHours: "", deleted: false }]);
  }

  function toggleDeleteRow(key: string) {
    setDraftRows((rows) => {
      const target = rows.find((r) => r.key === key);
      if (target && target.id === undefined) {
        // Baris baru yang belum pernah disimpan -- hapus langsung dari draft, tidak perlu ditandai.
        return rows.filter((r) => r.key !== key);
      }
      return rows.map((r) => (r.key === key ? { ...r, deleted: !r.deleted } : r));
    });
  }

  const rowsWithStatus = draftRows.map((draft) => ({
    draft,
    status: rowStatus(draft, draft.id !== undefined ? originalById.get(draft.id) : undefined),
  }));

  const changedCount = rowsWithStatus.filter((r) => r.status !== "unchanged").length;

  // Validasi durasiStart < durasiEnd per baris (block) + overlap dalam day_type yang sama (warning, tidak block) -- sesuai spec.
  const errors = new Map<string, string>();
  for (const { draft, status } of rowsWithStatus) {
    if (status === "deleted") continue;
    const start = parseDuration(draft.durasiStart);
    const end = parseDuration(draft.durasiEnd);
    if (draft.durasiStart === "" || draft.durasiEnd === "" || draft.otHours === "") {
      errors.set(draft.key, "Semua kolom wajib diisi.");
    } else if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(Number(draft.otHours))) {
      errors.set(draft.key, "Harus berupa angka.");
    } else if (start >= end) {
      errors.set(draft.key, "Durasi Start harus lebih kecil dari Durasi End.");
    }
  }
  const hasBlockingError = errors.size > 0;

  const activeRows = rowsWithStatus.filter((r) => r.status !== "deleted");
  const overlapWarnings: string[] = [];
  for (let i = 0; i < activeRows.length; i++) {
    for (let j = i + 1; j < activeRows.length; j++) {
      const a = activeRows[i].draft;
      const b = activeRows[j].draft;
      if (errors.has(a.key) || errors.has(b.key)) continue;
      const aStart = parseDuration(a.durasiStart), aEnd = parseDuration(a.durasiEnd);
      const bStart = parseDuration(b.durasiStart), bEnd = parseDuration(b.durasiEnd);
      if (aStart < bEnd && bStart < aEnd) {
        overlapWarnings.push(`Baris "${a.durasiStart}–${a.durasiEnd}" tumpang tindih dengan "${b.durasiStart}–${b.durasiEnd}".`);
      }
    }
  }

  async function handleSave() {
    if (hasBlockingError) {
      toast.error("Perbaiki dulu baris yang errornya ditandai merah.");
      return;
    }
    const payloadRows = rowsWithStatus
      .filter((r) => r.status !== "deleted")
      .map((r) => ({
        id: r.draft.id,
        dayType,
        durasiStart: parseDuration(r.draft.durasiStart),
        durasiEnd: parseDuration(r.draft.durasiEnd),
        otHours: Number(r.draft.otHours),
      }));
    // Baris yang tadinya ada di server tapi sekarang ditandai deleted TIDAK ikut dikirim --
    // updateBracketMaster men-diff "existing di DB tapi tidak ada di payload" sebagai delete.
    // Supaya day_type ini tetap "disentuh" walau semua baris dihapus, tetap kirim array kosong.
    setSaving(true);
    try {
      const res = await fetch("/api/attendance/bracket-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows, dayTypes: [dayType], changedBy: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan perubahan.");
      toast.success("Perubahan bracket disimpan.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={dayType} onValueChange={handleDayTypeChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_TYPES.map((dt) => (
                <SelectItem key={dt} value={dt}>
                  {dt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }} disabled={loading}>
            <RotateCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History />
            Lihat riwayat perubahan
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {changedCount > 0 && <Badge variant="warning">{changedCount} baris belum disimpan</Badge>}
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus />
            Tambah Baris
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || changedCount === 0 || hasBlockingError}>
            <Save />
            Simpan Perubahan
          </Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Perubahan di sini langsung mempengaruhi hasil crosscheck di Page 2 untuk data yang belum dihitung atau
        dihitung ulang.
      </p>

      {overlapWarnings.length > 0 && (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          {overlapWarnings.map((w, idx) => (
            <p key={idx}>⚠ {w}</p>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Durasi Start</TableHead>
                <TableHead className="w-32">Durasi End</TableHead>
                <TableHead className="w-32">OT Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsWithStatus.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada baris untuk {dayType}.
                  </TableCell>
                </TableRow>
              ) : (
                rowsWithStatus.map(({ draft, status }) => (
                  <TableRow
                    key={draft.key}
                    className={cn(
                      status === "new" && "bg-success/5",
                      status === "changed" && "bg-warning/5",
                      status === "deleted" && "bg-destructive/5 opacity-60",
                    )}
                  >
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="H:MM"
                        value={draft.durasiStart}
                        disabled={draft.deleted}
                        onChange={(e) => updateField(draft.key, "durasiStart", e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="H:MM"
                        value={draft.durasiEnd}
                        disabled={draft.deleted}
                        onChange={(e) => updateField(draft.key, "durasiEnd", e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        value={draft.otHours}
                        disabled={draft.deleted}
                        onChange={(e) => updateField(draft.key, "otHours", e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      {status === "new" && <Badge variant="success">Baru</Badge>}
                      {status === "changed" && <Badge variant="warning">Diubah</Badge>}
                      {status === "deleted" && <Badge variant="destructive">Dihapus</Badge>}
                      {status === "unchanged" && <span className="text-xs text-muted-foreground">—</span>}
                      {errors.has(draft.key) && <p className="mt-1 text-xs text-destructive">{errors.get(draft.key)}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => toggleDeleteRow(draft.key)} title={draft.deleted ? "Batalkan hapus" : "Hapus"}>
                        {draft.deleted ? <Undo2 className="size-4" /> : <Trash2 className="size-4 text-destructive" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <BracketMasterHistoryDialog dayType={dayType} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
