import type { DayType } from "@/lib/attendance/day-type";

/**
 * Bentuk fungsi lookup ke tabel `bracket_master` — mengembalikan `ot_hours`
 * untuk satu `day_type` & `selisih_hours`, atau `null` kalau tidak ketemu /
 * di luar rentang tabel. Sengaja hanya sebuah TYPE di sini (bukan
 * implementasi), diinject sebagai parameter ke `calculateOvertime()` (lihat
 * overtime-rules.ts) — bukan diimpor langsung — supaya rule engine tetap
 * pure function yang bisa ditest tanpa koneksi database (mirror
 * `lookup_bracket(selisih_hours, day_type, session)` di spec Python asli,
 * yang juga menerima session sebagai parameter, bukan modul global).
 *
 * Implementasi konkret (query ke `bracket_master` lewat
 * `AttendanceDatabaseAdapter`) ada di lib/database/attendance-adapter.ts.
 */
export type BracketLookupFn = (selisihHours: number, dayType: DayType) => number | null | Promise<number | null>;
