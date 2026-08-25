import type { DayType } from "@/lib/attendance/day-type";

/**
 * Tipe data untuk AttendanceDatabaseAdapter — mirror pola lib/database/types.ts
 * untuk DatabaseAdapter utama. Provider-agnostic: SQLite & Postgres
 * sama-sama menghasilkan/menerima bentuk ini.
 */

export interface BracketMasterRow {
  id: number;
  dayType: DayType;
  durasiStart: number;
  durasiEnd: number;
  otHours: number;
  updatedAt: string;
  updatedBy: string;
}

/** Input untuk updateBracketMaster — `id` absen berarti baris baru (belum pernah disimpan). */
export interface BracketMasterRowInput {
  id?: number;
  dayType: DayType;
  durasiStart: number;
  durasiEnd: number;
  otHours: number;
}

export type BracketChangeType = "created" | "updated" | "deleted";

/** Snapshot nilai LAMA sebelum diubah — untuk change_type "created", tidak ada nilai lama sehingga kolom durasi/ot_hours null. */
export interface BracketMasterHistoryRecord {
  id: number;
  bracketMasterId: number;
  dayType: DayType;
  durasiStart: number | null;
  durasiEnd: number | null;
  otHours: number | null;
  changedBy: string;
  changedAt: string;
  changeType: BracketChangeType;
}

export interface RawAttendanceInput {
  nik: string;
  nama: string;
  department: string;
  tanggal: string; // ISO yyyy-mm-dd
  intime: string | null;
  outtime: string | null;
  it1: string | null;
  ot1: string | null;
  whour: number | null;
  bhour: number | null;
  othourRecorded: number | null;
  kategori: string;
  importedBy: string;
  sourceFilename: string;
}

export interface RawAttendanceRecord extends RawAttendanceInput {
  id: number;
  importedAt: string;
  processStatus: "Done Process" | "Waiting Process";
}

export interface ExistingRecord {
  id: number;
  nik: string;
  tanggal: string;
}

/**
 * `date` sengaja ISO string (yyyy-mm-dd), BUKAN `Date` instance seperti di
 * draft addendum — konsisten dengan seluruh modul ini (day-type.ts,
 * overtime-rules.ts, importer.ts) yang sudah memakai ISO string untuk
 * menghindari bug timezone dari JS `Date`.
 */
export interface NikDatePair {
  nik: string;
  date: string;
}

export interface ImportSummary {
  inserted: number;
  skipped: number;
  rejected: number;
  conflicts: ExistingRecord[];
}

/**
 * Riwayat import, DITURUNKAN dari raw_attendance (GROUP BY source_filename,
 * imported_at, imported_by) — bukan tabel baru. Semua baris dari satu
 * panggilan importRawAttendance() berbagi imported_at yang sama persis
 * (di-set sekali per call, bukan per row), jadi GROUP BY ini = satu baris
 * per sesi import.
 */
export interface ImportHistoryEntry {
  sourceFilename: string;
  importedAt: string;
  importedBy: string;
  rowCount: number;
  processStatus: "Done Process" | "Waiting Process";
}

export interface ImportHistoryFilter {
  dateFrom?: string;
  dateTo?: string;
}

export interface RawAttendanceFilter {
  dateFrom?: string;
  dateTo?: string;
  department?: string;
  nik?: string;
  sourceFilename?: string;
  importedAt?: string;
}

export type CalculatedStatus = "Sesuai" | "Tidak Sesuai" | "Dikoreksi Manual" | "Cek Manual" | "Tidak Berlaku";

export interface CalculatedAttendanceRecord {
  id: number;
  rawId: number;
  dayType: DayType;
  bracketUsed: string;
  systemCalculatedOth: number | null;
  finalOth: number | null;
  status: CalculatedStatus;
  correctedBy: string | null;
  correctedAt: string | null;
  correctionNote: string | null;
  calculatedAt: string;
  // Denormalized dari raw_attendance lewat JOIN — Page 2 butuh ini untuk tampilan/filter tanpa query terpisah per baris.
  nik: string;
  nama: string;
  department: string;
  tanggal: string;
  intime?: string | null;
  outtime?: string | null;
  it1?: string | null;
  ot1?: string | null;
  whour?: number | null;
  kategori?: string;
  /** OTHour column as originally imported from Excel — compared against systemCalculatedOth to decide Sesuai/Tidak Sesuai, never itself the calculated value. */
  othourRecorded?: number | null;
}

export interface CalculatedAttendanceFilter {
  dateFrom?: string;
  dateTo?: string;
  department?: string;
  search?: string;
  status?: CalculatedStatus;
}

export interface CalculationSummary {
  processed: number;
  sesuai: number;
  tidakSesuai: number;
  cekManual: number;
  tidakBerlaku: number;
  /** Baris yang statusnya "Dikoreksi Manual" dan sengaja TIDAK ditimpa — final_oth tetap, hanya system_calculated_oth yang di-refresh. */
  preservedManualCorrections: number;
}
