import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildAttendanceReportBuffer } from "@/lib/attendance-report-service";
import type { CalculatedAttendanceRecord } from "@/lib/database/attendance-types";

const base = (overrides: Partial<CalculatedAttendanceRecord>): CalculatedAttendanceRecord => ({
  id: 1, rawId: 1, dayType: "Senin-Jumat", bracketUsed: "Bracket Senin-Jumat", systemCalculatedOth: 1, finalOth: 1, status: "Sesuai", correctedBy: null, correctedAt: null, correctionNote: null, calculatedAt: "2026-08-20T00:00:00.000Z", nik: "1001", nama: "LAILY", department: "CUTTING", tanggal: "2026-08-10", ...overrides,
});

describe("attendance report service", () => {
  it("menghasilkan agregat final OTH per karyawan dan department", async () => {
    const rows = [base({ finalOth: 2 }), base({ id: 2, tanggal: "2026-08-11", finalOth: 3 }), base({ id: 3, nik: "1002", nama: "KHOLIB", department: "SEWING", finalOth: 4 })];
    const employee = new ExcelJS.Workbook();
    await employee.xlsx.load((await buildAttendanceReportBuffer("employee", rows)) as unknown as Parameters<typeof employee.xlsx.load>[0]);
    expect(employee.worksheets[0].getCell("E2").value).toBe(5);
    const department = new ExcelJS.Workbook();
    await department.xlsx.load((await buildAttendanceReportBuffer("department", rows)) as unknown as Parameters<typeof department.xlsx.load>[0]);
    expect(department.worksheets[0].getCell("C2").value).toBe(5);
  });

  it("laporan eksepsi hanya memuat Tidak Sesuai dan Dikoreksi Manual", async () => {
    const rows = [base({ status: "Sesuai" }), base({ id: 2, status: "Tidak Sesuai", finalOth: 2 }), base({ id: 3, status: "Dikoreksi Manual", finalOth: 3, correctionNote: "manager" })];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildAttendanceReportBuffer("exceptions", rows)) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    expect(sheet.actualRowCount).toBe(3);
    expect(sheet.getCell("E2").value).toBe("Tidak Sesuai");
    expect(sheet.getCell("E3").value).toBe("Dikoreksi Manual");
  });
});
