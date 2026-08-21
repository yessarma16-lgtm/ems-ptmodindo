import "server-only";

import ExcelJS from "exceljs";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { getDatabaseProvider } from "@/lib/database/database";
import { writeAuditLog } from "@/lib/database/audit-log";
import type { CalculatedAttendanceRecord, CalculatedAttendanceFilter } from "@/lib/database/attendance-types";

export type AttendanceReportKind = "employee" | "department" | "exceptions";

function safePeriod(filters: CalculatedAttendanceFilter): string {
  return `${filters.dateFrom ?? "all"}_${filters.dateTo ?? "all"}`;
}

function total(rows: CalculatedAttendanceRecord[]): number {
  return rows.reduce((sum, row) => sum + (row.finalOth ?? 0), 0);
}

function styleWorksheet(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; });
  sheet.columns.forEach((column) => { column.width = Math.min(32, Math.max(12, (column.header?.toString().length ?? 12) + 4)); });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildAttendanceReportBuffer(kind: AttendanceReportKind, rows: CalculatedAttendanceRecord[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MET Attendance";
  const sheet = workbook.addWorksheet(kind === "employee" ? "Rekap Karyawan" : kind === "department" ? "Rekap Department" : "Laporan Eksepsi");

  if (kind === "employee") {
    const groups = new Map<string, { nik: string; nama: string; department: string; totalOth: number; rows: number }>();
    for (const row of rows) {
      const existing = groups.get(row.nik) ?? { nik: row.nik, nama: row.nama, department: row.department, totalOth: 0, rows: 0 };
      existing.totalOth += row.finalOth ?? 0; existing.rows += 1; groups.set(row.nik, existing);
    }
    sheet.columns = [{ header: "NIK", key: "nik" }, { header: "Nama", key: "nama" }, { header: "Department", key: "department" }, { header: "Jumlah Baris", key: "rows" }, { header: "Total Final OTH", key: "totalOth" }];
    for (const row of groups.values()) sheet.addRow(row);
  } else if (kind === "department") {
    const groups = new Map<string, { department: string; totalOth: number; rows: number }>();
    for (const row of rows) {
      const existing = groups.get(row.department) ?? { department: row.department, totalOth: 0, rows: 0 };
      existing.totalOth += row.finalOth ?? 0; existing.rows += 1; groups.set(row.department, existing);
    }
    sheet.columns = [{ header: "Department", key: "department" }, { header: "Jumlah Baris", key: "rows" }, { header: "Total Final OTH", key: "totalOth" }];
    for (const row of groups.values()) sheet.addRow(row);
  } else {
    sheet.columns = [{ header: "Tanggal", key: "tanggal" }, { header: "NIK", key: "nik" }, { header: "Nama", key: "nama" }, { header: "Department", key: "department" }, { header: "Status", key: "status" }, { header: "System Calculated OTH", key: "system" }, { header: "Final OTH", key: "final" }, { header: "Correction Note", key: "note" }, { header: "Corrected By", key: "by" }];
    for (const row of rows.filter((item) => item.status === "Tidak Sesuai" || item.status === "Dikoreksi Manual")) sheet.addRow({ tanggal: row.tanggal, nik: row.nik, nama: row.nama, department: row.department, status: row.status, system: row.systemCalculatedOth, final: row.finalOth, note: row.correctionNote, by: row.correctedBy });
  }
  styleWorksheet(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function generateAttendanceReport(kind: AttendanceReportKind, filters: CalculatedAttendanceFilter, exportedBy: string) {
  const rows = await getAttendanceAdapter().getCalculatedAttendance(filters);
  const buffer = await buildAttendanceReportBuffer(kind, rows);
  const filename = `attendance-${kind}-${safePeriod(filters)}.xlsx`;
  if (getDatabaseProvider() === "sqlite") writeAuditLog("ATTENDANCE_REPORT_EXPORT", "AttendanceReport", filename, { kind, exported_by: exportedBy, row_count: rows.length, total_final_oth: total(rows), date_from: filters.dateFrom ?? null, date_to: filters.dateTo ?? null, department: filters.department ?? null });
  return { buffer, filename };
}
