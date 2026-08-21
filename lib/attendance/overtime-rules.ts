import { getDayType } from "@/lib/attendance/day-type";
import type { BracketLookupFn } from "@/lib/attendance/bracket-table";

/**
 * Rule engine overtime — port persis dari hasil trial-and-error dengan data
 * real (lihat docs/ATTENDANCE_OVERTIME_MODULE_SPEC.md bagian "Rule engine").
 * Urutan langkahnya WAJIB dipertahankan persis, jangan disederhanakan.
 */

export interface OvertimeInput {
  intime: string; // 'HH:mm'
  it1: string; // 'HH:mm'
  outtime: string; // 'HH:mm'
  ot1: string; // 'HH:mm'
  tanggal: string; // ISO date (yyyy-mm-dd)
  kategori: string;
}

const HARI_LIBUR_LEMBUR = "Hari Libur/Lembur";

function toHours(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

/** Bulatkan ke kelipatan 0.5 jam: sisa menit 0-30 turun (floor), 31-45 -> floor+0.5, 46-60 -> floor+1. */
function roundToHalfHour(hours: number): number {
  const flooredHour = Math.floor(hours);
  const minutes = Math.round((hours - flooredHour) * 60);
  if (minutes <= 30) return flooredHour;
  if (minutes <= 45) return flooredHour + 0.5;
  return flooredHour + 1;
}

/**
 * `lookupBracket` diinject oleh caller (bukan diimpor global) supaya
 * function ini pure & bisa ditest tanpa database — lihat bracket-table.ts.
 * Untuk kategori "Hari Libur/Lembur" atau saat `selisih <= 0`,
 * `lookupBracket` sengaja TIDAK dipanggil sama sekali.
 */
export async function calculateOvertime(input: OvertimeInput, lookupBracket: BracketLookupFn): Promise<number | null> {
  const dayType = getDayType(input.tanggal);

  // 2. Kategori "Hari Libur/Lembur" (Sabtu ATAU Minggu, ditentukan dari
  // kolom kategori — bukan hari kalender) pakai rumus khusus, tidak pakai
  // tabel bracket sama sekali.
  if (input.kategori === HARI_LIBUR_LEMBUR) {
    const start = Math.max(toHours(input.intime), toHours(input.it1));
    const workingHour = toHours(input.ot1) - start;
    const roundedWh = roundToHalfHour(workingHour);
    return roundedWh > 4 ? roundedWh - 1 : roundedWh;
  }

  // 3. Bukan "Hari Libur/Lembur", day_type Senin-Jumat atau Sabtu.
  if (dayType === "Senin-Jumat" || dayType === "Sabtu") {
    const selisih = toHours(input.ot1) - toHours(input.outtime);
    if (selisih <= 0) return 0; // OT1 <= OutTime = pulang tepat waktu/lebih awal = Normal
    return lookupBracket(selisih, dayType);
  }

  // 4. day_type Minggu & kategori bukan "Hari Libur/Lembur" (jarang terjadi, tetap di-handle sebagai fallback).
  const selisih = toHours(input.ot1) - toHours(input.outtime);
  if (selisih <= 0) return 0;
  return lookupBracket(selisih, "Minggu");
}
