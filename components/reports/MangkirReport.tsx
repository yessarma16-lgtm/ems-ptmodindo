"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileDown, Loader2, MessageCircle, Play, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { AttendanceDatePicker } from "@/components/attendance/AttendanceDatePicker";
import { formatDateDMY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { useEmployeeReportSession, type MangkirEvent } from "@/components/reports/EmployeeReportSession";
import { toast } from "sonner";

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Preview-only mirror of buildFullLetterNumber in lib/mangkir-letter.ts (kept separate — that module pulls in pdf-lib + the embedded letterhead, too heavy to import client-side just for this). HR only ever types the leading sequence number; "/HRD_SPK/{bulan romawi}/{tahun}" always comes from the letter's own issue date (its episode's last absence date). */
function previewFullLetterNumber(sequence: string, lastTriggerDateIso: string): string {
  if (!sequence.trim()) return "";
  const m = /^(\d{4})-(\d{2})/.exec(lastTriggerDateIso);
  if (!m) return sequence;
  const [, year, month] = m;
  return `${sequence.trim()}/HRD_SPK/${ROMAN_MONTHS[Number(month) - 1]}/${year}`;
}

function letterPdfUrl(e: MangkirEvent) {
  const q = new URLSearchParams({
    recordId: e.recordId, nik: e.nik, name: e.name, position: e.position, department: e.department,
    address: e.address, shed: e.shed, division: e.division,
    phoneNumber: e.phoneNumber, level: String(e.level), episodeStartDate: e.episodeStartDate, dates: e.triggerDates.join(","),
  });
  return `/api/reports/mangkir/letter/pdf?${q}`;
}

/**
 * One table row per (employee, absence episode) — the escalation levels
 * (Surat Panggilan 1 / 2) that the episode has reached live inside that row
 * as `levels[1]` / `levels[2]`. The API still returns one MangkirEvent per
 * (episode, level); this merges them so the Status column can show both SP1
 * and SP2 at once and the action dialog can offer a level picker.
 */
interface EpisodeRow {
  key: string;
  recordId: string;
  nik: string;
  name: string;
  position: string;
  department: string;
  address: string;
  shed: string;
  division: string;
  phoneNumber: string;
  episodeStartDate: string;
  episodeLength: number;
  levels: Partial<Record<1 | 2, MangkirEvent>>;
  /** The longest cited date list available (SP2's if reached, else SP1's) — shown in the "Tanggal Mangkir" column. */
  allDates: string[];
}

function groupEpisodes(events: MangkirEvent[]): EpisodeRow[] {
  const map = new Map<string, EpisodeRow>();
  for (const e of events) {
    const key = `${e.recordId}|${e.episodeStartDate}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key, recordId: e.recordId, nik: e.nik, name: e.name, position: e.position,
        department: e.department, address: e.address, shed: e.shed, division: e.division,
        phoneNumber: e.phoneNumber, episodeStartDate: e.episodeStartDate, episodeLength: e.episodeLength,
        levels: {}, allDates: [],
      };
      map.set(key, row);
    }
    row.levels[e.level] = e;
    row.episodeLength = Math.max(row.episodeLength, e.episodeLength);
    if (e.triggerDates.length > row.allDates.length) row.allDates = e.triggerDates;
  }
  return Array.from(map.values()).sort((a, b) => b.episodeLength - a.episodeLength || a.name.localeCompare(b.name));
}

function levelStatusText(e: MangkirEvent): string {
  if (!e.sentAt) return "belum dikirim";
  const date = new Date(e.sentAt).toLocaleDateString("id-ID");
  return `terkirim ${date}${e.sentBy ? ` oleh ${e.sentBy}` : ""}`;
}

/**
 * "Report Mangkir" — Active employees whose unauthorized absence (kategori =
 * "Mangkir" in attendance, not merely a blank clock time — see
 * lib/mangkir-service.ts) reaches the Surat Panggilan 1 or 2 threshold
 * (Minggu/libur nasional dilewati, tidak memutus rentetan; hari kerja lain —
 * Normal, Cuti, Ijin, dll — memutus rentetan). Thresholds are set on Report
 * Setup. Live — recomputed on every Run, never stored; the last Run's result
 * stays on screen until Clear or a hard page reload.
 */
export function MangkirReport() {
  const { mangkir, setMangkir, clearMangkir } = useEmployeeReportSession();
  const { dateFrom, dateTo, report, hasRun } = mangkir;
  const levelFilter = new Set(mangkir.levelFilter);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [actionRow, setActionRow] = useState<EpisodeRow | null>(null);
  const [actionMode, setActionMode] = useState<"pdf" | "wa">("pdf");
  const [actionLevel, setActionLevel] = useState<1 | 2 | null>(null);
  const [numberInput, setNumberInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [waTarget, setWaTarget] = useState<"web" | "app">("web");

  useEffect(() => {
    fetch("/api/attendance/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setProcessedDates(v.processedDates ?? [])).catch(() => undefined);
    try {
      const saved = localStorage.getItem("mangkir-wa-target");
      // queueMicrotask — same deferral as AppShell's collapsed-sidebar read, keeps
      // the setState out of the synchronous effect body (react-hooks/set-state-in-effect).
      if (saved === "web" || saved === "app") queueMicrotask(() => setWaTarget(saved));
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, []);

  function chooseWaTarget(target: "web" | "app") {
    setWaTarget(target);
    try {
      localStorage.setItem("mangkir-wa-target", target);
    } catch {
      /* ignore — the choice just won't be remembered */
    }
  }

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { toast.error("Pilih tanggal mulai dan tanggal akhir yang valid."); return; }
    setMangkir({ hasRun: true });
    setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom, dateTo });
      const r = await fetch(`/api/reports/mangkir?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load report.");
      setMangkir({ report: await r.json() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  function toggleLevelFilter(level: 1 | 2) {
    const next = new Set(levelFilter);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    setMangkir({ levelFilter: Array.from(next) });
  }

  const rows = groupEpisodes(report?.events ?? []);
  const filteredRows = rows.filter(
    (row) => (row.levels[1] && levelFilter.has(1)) || (row.levels[2] && levelFilter.has(2)),
  );

  const filterLabel =
    levelFilter.size === 2 ? "SP1 & SP2" : levelFilter.has(1) ? "SP1" : levelFilter.has(2) ? "SP2" : "Tidak ada";

  const dialogLevelEvent = actionRow && actionLevel ? actionRow.levels[actionLevel] ?? null : null;

  function openAction(row: EpisodeRow, mode: "pdf" | "wa") {
    const reached = ([1, 2] as const).filter((l) => row.levels[l]);
    const initial = reached.length === 1 ? reached[0] : null;
    setActionRow(row);
    setActionMode(mode);
    setActionLevel(initial);
    setNumberInput(initial ? row.levels[initial]?.letterNumber ?? "" : "");
  }

  function pickLevel(level: 1 | 2) {
    if (!actionRow?.levels[level]) return;
    setActionLevel(level);
    setNumberInput(actionRow.levels[level]?.letterNumber ?? "");
  }

  async function confirmAction() {
    if (!actionRow || !actionLevel) return;
    const lvlEvent = actionRow.levels[actionLevel];
    if (!lvlEvent) return;

    if (actionMode === "wa") {
      // WhatsApp reuses the number already set when the PDF was generated —
      // it's read-only here, never re-saved. No number yet = generate the PDF first.
      if (!actionRow.phoneNumber) { toast.error("Karyawan ini belum punya nomor HP di data master."); return; }
      if (!lvlEvent.letterNumber.trim()) { toast.error(`Belum ada nomor surat — Generate PDF Surat Panggilan ${actionLevel} dulu.`); return; }
      setProcessing(true);
      try {
        const res = await fetch("/api/reports/mangkir/letter/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: lvlEvent }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Gagal menyiapkan pesan.");
        if (waTarget === "app") {
          // Custom scheme — hands off to WhatsApp Desktop without navigating this page away.
          window.location.href = data.whatsappAppLink;
          toast.success("Membuka aplikasi WhatsApp dengan teks surat — tinggal kirim.");
        } else {
          // Named target: a second send reuses the same WhatsApp Web tab instead of piling up new ones.
          window.open(data.whatsappWebLink, "modWhatsAppTab");
          toast.success("WhatsApp Web terbuka dengan teks surat — tinggal kirim.");
        }
        void load(); // refresh so the "terkirim" status shows immediately
        setActionRow(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Gagal memproses.");
      } finally {
        setProcessing(false);
      }
      return;
    }

    // PDF: HR types the number, it's saved, then the PDF opens.
    setProcessing(true);
    try {
      const numRes = await fetch("/api/reports/mangkir/letter/number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: actionRow.recordId, nik: actionRow.nik, level: actionLevel,
          episodeStartDate: actionRow.episodeStartDate, triggerDates: lvlEvent.triggerDates, letterNumber: numberInput,
        }),
      });
      if (!numRes.ok) throw new Error("Gagal menyimpan nomor surat.");

      const savedEvent: MangkirEvent = { ...lvlEvent, letterNumber: numberInput.trim() };
      // Keep the saved number on the row so the WhatsApp dialog can reuse it.
      setMangkir({
        report: report
          ? {
              ...report,
              events: report.events.map((x) =>
                x.recordId === savedEvent.recordId && x.episodeStartDate === savedEvent.episodeStartDate && x.level === savedEvent.level
                  ? savedEvent
                  : x,
              ),
            }
          : report,
      });

      window.open(letterPdfUrl(savedEvent), "_blank");
      setActionRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-5">
        <div><label className="mb-1 block text-xs font-medium">From</label><AttendanceDatePicker value={dateFrom} onChange={(v) => setMangkir({ dateFrom: v })} processedDates={processedDates} /></div>
        <div><label className="mb-1 block text-xs font-medium">To</label><AttendanceDatePicker value={dateTo} onChange={(v) => setMangkir({ dateTo: v })} processedDates={processedDates} /></div>
        <Button
          size="icon"
          className="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md transition-all hover:shadow-lg hover:from-violet-600 hover:to-violet-700"
          title="Run"
          aria-label="Run"
          onClick={() => void load()}
          disabled={loading}
        >
          <Play className="size-[18px]" />
        </Button>
        <Button variant="outline" size="icon" title="Clear" aria-label="Clear" onClick={clearMangkir} disabled={loading}>
          <X className="size-[18px]" />
        </Button>
        <div>
          <label className="mb-1 block text-xs font-medium">Filter Level</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 font-normal">
                {filterLabel}
                <ChevronDown className="size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Tampilkan level</DropdownMenuLabel>
              {([1, 2] as const).map((level) => (
                <DropdownMenuCheckboxItem
                  key={level}
                  checked={levelFilter.has(level)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleLevelFilter(level)}
                >
                  Surat Panggilan {level}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!hasRun ? (
        <p className="text-sm text-muted-foreground">Pilih rentang tanggal, lalu klik Run.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada karyawan yang kena Surat Panggilan pada rentang/filter ini.</p>
      ) : (
        <Card className="overflow-auto">
          <CardContent className="pt-6">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">NIK</th>
                  <th className="border p-2 text-left">Name</th>
                  <th className="border p-2 text-left">Jabatan</th>
                  <th className="border p-2 text-left">Department</th>
                  <th className="border p-2">Level</th>
                  <th className="border p-2 text-left">Tanggal Mangkir</th>
                  <th className="border p-2 text-left">Status</th>
                  <th className="border p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.key}>
                    <td className="border p-2">{row.nik}</td>
                    <td className="border p-2 font-medium">
                      <Link href={`/employees/${row.recordId}`} className="text-primary hover:underline">{row.name}</Link>
                    </td>
                    <td className="border p-2">{row.position}</td>
                    <td className="border p-2">{row.department}</td>
                    <td className="border p-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {([1, 2] as const).filter((l) => row.levels[l]).map((l) => (
                          <Badge key={l} variant="destructive">SP {l}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="border p-2">
                      <div className="flex flex-wrap gap-1">
                        {row.allDates.map((d) => (
                          <span key={d} className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap">
                            {formatDateDMY(d)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="border p-2 text-xs">
                      <div className="space-y-0.5">
                        {row.levels[1] && (
                          <div>
                            <span className="font-medium">SP1:</span>{" "}
                            <span className={row.levels[1]?.sentAt ? "" : "text-muted-foreground"}>{levelStatusText(row.levels[1]!)}</span>
                          </div>
                        )}
                        {row.levels[2] && (
                          <div>
                            <span className="font-medium">SP2:</span>{" "}
                            <span className={row.levels[2]?.sentAt ? "" : "text-muted-foreground"}>{levelStatusText(row.levels[2]!)}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border p-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="icon" title="Generate PDF Surat Panggilan" onClick={() => openAction(row, "pdf")}>
                          <FileDown className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={!row.phoneNumber}
                          title={row.phoneNumber ? "Kirim via WhatsApp" : "Karyawan belum punya nomor HP"}
                          onClick={() => openAction(row, "wa")}
                        >
                          <MessageCircle className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!actionRow} onOpenChange={(open) => !open && !processing && setActionRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionMode === "pdf" ? "Generate PDF Surat Panggilan" : "Kirim Surat Panggilan via WhatsApp"}</DialogTitle>
            <DialogDescription>
              {actionRow?.name} — pilih level surat, lalu isi nomor dokumennya. Nomor SP1 dan SP2 disimpan terpisah.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              {([1, 2] as const).map((level) => {
                const reached = !!actionRow?.levels[level];
                return (
                  <button
                    key={level}
                    type="button"
                    disabled={!reached}
                    onClick={() => pickLevel(level)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      actionLevel === level
                        ? "border-rose-600 bg-rose-50 text-rose-700"
                        : reached
                          ? "border-border hover:bg-muted"
                          : "cursor-not-allowed border-border opacity-40",
                    )}
                  >
                    Surat Panggilan {level}
                    {!reached && <span className="mt-0.5 block text-[10px] font-normal">belum tembus ambang</span>}
                  </button>
                );
              })}
            </div>

            {actionLevel && actionRow && dialogLevelEvent && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">Nomor surat</label>
                <Input
                  value={actionMode === "wa" ? dialogLevelEvent.letterNumber : numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  placeholder="5"
                  autoFocus={actionMode === "pdf"}
                  readOnly={actionMode === "wa"}
                  className={actionMode === "wa" ? "bg-muted text-muted-foreground" : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  {actionMode === "wa"
                    ? "Nomor mengikuti yang dipakai saat Generate PDF — tidak bisa diubah di sini."
                    : "Bagian “/HRD_SPK/bulan romawi/tahun” otomatis mengikuti tanggal surat — cukup isi angkanya."}
                </p>
                {actionMode === "wa" && !dialogLevelEvent.letterNumber.trim() && (
                  <p className="text-sm text-amber-600">
                    Belum ada nomor surat. Generate PDF Surat Panggilan {actionLevel} dulu untuk menetapkan nomornya.
                  </p>
                )}
                {(actionMode === "wa" ? dialogLevelEvent.letterNumber : numberInput).trim() && (
                  <p className="text-sm text-muted-foreground">
                    Nomor lengkap:{" "}
                    <span className="font-medium text-foreground">
                      {previewFullLetterNumber(
                        actionMode === "wa" ? dialogLevelEvent.letterNumber : numberInput,
                        dialogLevelEvent.triggerDates[dialogLevelEvent.triggerDates.length - 1] ?? "",
                      )}
                    </span>
                  </p>
                )}
              </div>
            )}

            {actionMode === "wa" && actionLevel && dialogLevelEvent && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">Buka lewat</label>
                <div className="flex gap-2">
                  {(["web", "app"] as const).map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => chooseWaTarget(target)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        waTarget === target ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-border hover:bg-muted",
                      )}
                    >
                      {target === "web" ? "WhatsApp Web" : "Aplikasi WhatsApp"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {waTarget === "web"
                    ? "Buka di tab WhatsApp Web (dipakai ulang, tidak menumpuk tab baru)."
                    : "Buka di aplikasi WhatsApp Desktop yang terpasang."}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionRow(null)} disabled={processing}>Batal</Button>
            <Button
              onClick={() => void confirmAction()}
              disabled={
                processing ||
                !actionLevel ||
                (actionMode === "wa" && !dialogLevelEvent?.letterNumber.trim())
              }
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : actionMode === "pdf" ? "Generate PDF" : "Buka WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
