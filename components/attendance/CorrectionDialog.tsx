"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CalculatedAttendanceRecord } from "@/lib/database/attendance-types";

interface CorrectionDialogProps {
  row: CalculatedAttendanceRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}

export function CorrectionDialog({ row, open, onOpenChange, onSaved }: CorrectionDialogProps) {
  const [it1, setIt1] = useState(row?.it1 ?? "");
  const [ot1, setOt1] = useState(row?.ot1 ?? "");
  const [value, setValue] = useState(row?.finalOth == null ? "" : String(row.finalOth));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedValue = Number(value);
  const canSubmit = value.trim() !== "" && Number.isFinite(parsedValue) && parsedValue >= 0 && note.trim() !== "" && !saving;

  async function submit() {
    if (!row || !canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/attendance/calculation/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, rawId: row.rawId, it1: it1.trim(), ot1: ot1.trim(), newValue: parsedValue, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan koreksi.");
      toast.success("Attendance correction saved.");
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Attendance Result</DialogTitle>
          <DialogDescription>{row ? `${row.nama} — ${row.tanggal}. Status akan menjadi Dikoreksi Manual.` : "Pilih baris yang perlu dikoreksi."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="correction-it1" className="mb-1 block text-sm font-medium">IT1</label>
            <Input id="correction-it1" type="time" value={it1} onChange={(e) => setIt1(e.target.value)} />
          </div>
          <div>
            <label htmlFor="correction-ot1" className="mb-1 block text-sm font-medium">OT1</label>
            <Input id="correction-ot1" type="time" value={ot1} onChange={(e) => setOt1(e.target.value)} />
          </div>
          <div>
            <label htmlFor="correction-final-oth" className="mb-1 block text-sm font-medium">Final OTH baru</label>
            <Input id="correction-final-oth" type="number" min="0" step="0.5" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label htmlFor="correction-note" className="mb-1 block text-sm font-medium">Correction note wajib diisi</label>
            <Textarea id="correction-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Jelaskan alasan perubahan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Simpan Koreksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
