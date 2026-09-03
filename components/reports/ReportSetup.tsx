"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface DurationFilter {
  duration: number;
  timeOverdueFilter: boolean;
}

/**
 * "Report Setup" — configuration shared by the report pages:
 *  - Report Mangkir: the two Surat Panggilan escalation thresholds
 *    (consecutive scheduled work days of Mangkir) and the letter signer.
 *  - Report Time Overdue: restricts the report to attendance whose FINAL OTH
 *    matches a checked duration. Nothing checked = no filter (show everything).
 * Every control saves immediately on change/click.
 */
export function ReportSetup() {
  const [durations, setDurations] = useState<DurationFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDuration, setSavingDuration] = useState<number | null>(null);
  const [othZeroFilter, setOthZeroFilter] = useState(false);

  const [sp1Threshold, setSp1Threshold] = useState<number | "">("");
  const [sp2Threshold, setSp2Threshold] = useState<number | "">("");
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<1 | 2 | null>(null);

  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [savingSigner, setSavingSigner] = useState(false);

  useEffect(() => {
    fetch("/api/reports/time-overdue/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => { setDurations(v.durations ?? []); setOthZeroFilter(v.othZeroFilter === true); })
      .catch(() => toast.error("Failed to load setup."))
      .finally(() => setLoading(false));

    fetch("/api/reports/mangkir/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => {
        setSp1Threshold(v.sp1Threshold ?? 3);
        setSp2Threshold(v.sp2Threshold ?? 5);
        setSignerName(v.signerName ?? "");
        setSignerTitle(v.signerTitle ?? "");
      })
      .catch(() => toast.error("Failed to load setup."))
      .finally(() => setThresholdLoading(false));
  }, []);

  async function saveThreshold(level: 1 | 2, value: number | "") {
    if (value === "" || value < 1) { toast.error("Masukkan angka minimal 1."); return; }
    setSavingLevel(level);
    try {
      const res = await fetch("/api/reports/mangkir/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, threshold: value }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Threshold Surat Panggilan ${level} disimpan.`);
    } catch {
      toast.error("Gagal menyimpan threshold.");
    } finally {
      setSavingLevel(null);
    }
  }

  async function saveSigner() {
    if (!signerName.trim() || !signerTitle.trim()) { toast.error("Nama dan jabatan wajib diisi."); return; }
    setSavingSigner(true);
    try {
      const res = await fetch("/api/reports/mangkir/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName, signerTitle }),
      });
      if (!res.ok) throw new Error();
      toast.success("Penandatangan disimpan.");
    } catch {
      toast.error("Gagal menyimpan penandatangan.");
    } finally {
      setSavingSigner(false);
    }
  }

  async function toggle(duration: number, checked: boolean) {
    setDurations((prev) => prev.map((d) => (d.duration === duration ? { ...d, timeOverdueFilter: checked } : d)));
    setSavingDuration(duration);
    try {
      const res = await fetch("/api/reports/time-overdue/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration, timeOverdueFilter: checked }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to save. Reverting.");
      setDurations((prev) => prev.map((d) => (d.duration === duration ? { ...d, timeOverdueFilter: !checked } : d)));
    } finally {
      setSavingDuration(null);
    }
  }

  async function toggleOthZero(checked: boolean) {
    setOthZeroFilter(checked);
    try {
      const res = await fetch("/api/reports/time-overdue/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ othZeroFilter: checked }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Gagal menyimpan filter OTH = 0. Perubahan dibatalkan.");
      setOthZeroFilter(!checked);
    }
  }

  const checkedCount = durations.filter((d) => d.timeOverdueFilter).length + (othZeroFilter ? 1 : 0);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Report Mangkir — Ambang Batas Surat Panggilan</h3>
        <p className="text-sm text-muted-foreground">
          Jumlah hari kerja Mangkir berturut-turut sebelum karyawan dikenakan Surat Panggilan. Minggu/libur nasional
          dilewati dan tidak memutus rentetan; hari kerja lain (Normal, Cuti, Ijin, dll) memutus rentetan.
        </p>
        {thresholdLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-36 text-sm">Surat Panggilan 1</span>
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                value={sp1Threshold}
                onChange={(e) => setSp1Threshold(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">hari kerja</span>
              <Button size="sm" onClick={() => void saveThreshold(1, sp1Threshold)} disabled={savingLevel === 1}>
                {savingLevel === 1 ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-36 text-sm">Surat Panggilan 2</span>
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                value={sp2Threshold}
                onChange={(e) => setSp2Threshold(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">hari kerja</span>
              <Button size="sm" onClick={() => void saveThreshold(2, sp2Threshold)} disabled={savingLevel === 2}>
                {savingLevel === 2 ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Report Mangkir — Penandatangan Surat</h3>
        <p className="text-sm text-muted-foreground">Nama & jabatan yang muncul di blok tanda tangan Surat Panggilan.</p>
        {thresholdLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 w-64" placeholder="Nama" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            <Input className="h-9 w-48" placeholder="Jabatan" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
            <Button size="sm" onClick={() => void saveSigner()} disabled={savingSigner}>
              {savingSigner ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Report Time Overdue — Filter OTH</h3>
        <p className="text-sm text-muted-foreground">
          Centang durasi OTH (Final OTH) yang mau dimasukkan ke Report Time Overdue.{" "}
          {checkedCount === 0 ? "Belum ada yang dicentang — report menampilkan semua data (tanpa filter)." : `${checkedCount} durasi dicentang — report hanya menghitung data dengan OTH tersebut.`}
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-4 lg:grid-cols-6">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={othZeroFilter} onCheckedChange={(checked) => void toggleOthZero(checked === true)} aria-label="Filter OTH sama dengan 0" />
              OTH = 0
            </label>
            {durations.map((d) => (
              <label key={d.duration} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={d.timeOverdueFilter}
                  onCheckedChange={(checked) => void toggle(d.duration, checked === true)}
                  aria-label={`Filter OTH ${d.duration} jam`}
                />
                OTH {d.duration} jam
                {savingDuration === d.duration && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
