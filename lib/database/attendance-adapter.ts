import "server-only";

import type { DayType } from "@/lib/attendance/day-type";
import type { BracketLookupFn } from "@/lib/attendance/bracket-table";
import { getPostgresAttendanceAdapter } from "@/lib/database/postgres-attendance";
export { AttendanceProviderNotSupportedError, AttendanceValidationError } from "@/lib/database/attendance-errors";
import type {
  BracketMasterRow,
  BracketMasterRowInput,
  BracketMasterHistoryRecord,
  RawAttendanceInput,
  RawAttendanceRecord,
  RawAttendanceFilter,
  ImportHistoryFilter,
  ExistingRecord,
  ImportSummary,
  ImportHistoryEntry,
  NikDatePair,
  CalculatedAttendanceRecord,
  CalculatedAttendanceFilter,
  CalculationSummary,
} from "@/lib/database/attendance-types";

/**
 * Interface & provider selector khusus modul Attendance/Overtime — sengaja
 * TERPISAH dari `DatabaseAdapter` (lib/database/database-adapter.ts).
 * `DatabaseAdapter` wajib diimplementasikan oleh SEMUA provider termasuk
 * Google Sheets; modul ini sengaja tidak didukung di Google Sheets (data
 * relasional bracket + raw + calculated tidak cocok dipetakan ke sheet),
 * jadi menambah methodnya ke `DatabaseAdapter` akan memaksa
 * `google-sheets-adapter.ts` implement method yang tidak pernah bisa jalan
 * di sana. Lihat docs/ATTENDANCE_OVERTIME_MODULE_SPEC.md bagian
 * "Database adapter" untuk detail keputusan ini.
 */
export interface AttendanceDatabaseAdapter {
  /** Sama seperti bracket-table.ts, diekspos di sini juga supaya caller lain (mis. langkah re-run manual) tidak perlu construct closure sendiri. */
  lookupBracket: BracketLookupFn;

  // raw_attendance
  /**
   * `onConflict` default "ask": baris yang (nik, tanggal) sudah ada di DB
   * TIDAK ditulis sama sekali, hanya dilaporkan lewat `conflicts` di
   * ImportSummary — sesuai spec Page 1 ("tanya user: Timpa atau Lewati").
   * "skip"/"overwrite" dipakai saat user sudah menjawab pertanyaan itu.
   */
  importRawAttendance(rows: RawAttendanceInput[], onConflict?: "ask" | "skip" | "overwrite", onProgress?: (processed: number) => void): Promise<ImportSummary>;
  findExistingByNikDate(pairs: NikDatePair[]): Promise<ExistingRecord[]>;
  getRawAttendance(filters: RawAttendanceFilter): Promise<RawAttendanceRecord[]>;
  countRawAttendance(filters: { dateFrom?: string; dateTo?: string; department?: string; search?: string }): Promise<number>;
  countCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<number>;
  updateRawAttendanceTimes(rawId: number, it1: string | null, ot1: string | null): Promise<void>;
  /** Diturunkan dari raw_attendance (GROUP BY), bukan tabel terpisah — lihat ImportHistoryEntry. */
  getImportHistory(filters?: ImportHistoryFilter): Promise<ImportHistoryEntry[]>;
  deleteImport(sourceFilename: string, importedAt: string): Promise<void>;
  /** Distinct `tanggal` yang sudah punya minimal satu baris calculated_attendance — untuk indikator "MPP Calculation selesai" di date picker. */
  getProcessedDates(): Promise<string[]>;

  // bracket_master
  getBracketMaster(dayType?: DayType): Promise<BracketMasterRow[]>;
  /**
   * Bulk create/update/delete untuk day_type yang muncul di `rows` atau
   * `dayTypesTouched` (day_type lain tidak disentuh) — dengan history write,
   * satu transaksi. `dayTypesTouched` diperlukan saat semua baris untuk satu
   * day_type dihapus sehingga `rows` kosong.
   */
  updateBracketMaster(rows: BracketMasterRowInput[], changedBy: string, dayTypesTouched?: DayType[]): Promise<void>;
  getBracketMasterHistory(bracketId?: number): Promise<BracketMasterHistoryRecord[]>;

  // calculated_attendance
  /** rawIds diisi -> paksa hitung ulang baris itu (dipakai juga utk refresh setelah bracket_master berubah). rawIds kosong/undefined -> hanya proses raw_attendance yang belum punya calculated_attendance sama sekali. */
  runCrosscheck(rawIds?: number[], filters?: { dateFrom?: string; dateTo?: string; limit?: number }, onProgress?: (processed: number, total: number) => void, shouldCancel?: () => boolean): Promise<CalculationSummary>;
  getCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<CalculatedAttendanceRecord[]>;
  correctFinalOth(id: number, newValue: number, note: string, correctedBy: string): Promise<void>;
}

export function getAttendanceAdapter(): AttendanceDatabaseAdapter {
  return getPostgresAttendanceAdapter();
}
