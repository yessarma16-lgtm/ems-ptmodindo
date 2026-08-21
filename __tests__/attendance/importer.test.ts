import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

import { parseAttendanceImportWorkbook, WHITELIST_HEADERS, type ParsedAttendanceImport } from "@/lib/attendance/importer";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "attendance_import_fixture.xlsx");

describe("attendance importer", () => {
  let result: ParsedAttendanceImport;

  beforeAll(async () => {
    const buffer = await fs.readFile(FIXTURE_PATH);
    result = await parseAttendanceImportWorkbook(buffer);
  });

  it("mengenali semua kolom whitelist dari header baris 1", () => {
    expect(result.headerRowNumber).toBe(1);
    expect(WHITELIST_HEADERS.length).toBe(15);
    // setiap baris hasil parse punya seluruh field yang berasal dari 15 kolom whitelist
    const first = result.rows[0];
    expect(Object.keys(first)).toEqual(
      expect.arrayContaining([
        "rowNo", "lastDeptname", "nik", "nama", "tanggal", "hk56",
        "intime", "outtime", "it1", "ot1", "whour", "bhour", "othour", "kategori", "quitDate",
      ]),
    );
  });

  it("mengabaikan kolom di luar whitelist tanpa error", () => {
    // fixture punya kolom tambahan "InTime (Jam)" / "IT1 (Jam)" di luar whitelist -- parse tetap sukses
    expect(result.rows.length + result.rejected.length).toBeGreaterThan(0);
    expect(result.rows[0].nik).toBe("2318060259");
  });

  it("menerima baris dengan jam kosong (Hari Libur/Minggu) tanpa reject", () => {
    const row = result.rows.find((r) => r.tanggal === "2026-08-02");
    expect(row).toBeDefined();
    expect(row!.kategori).toBe("Hari Libur/Minggu");
    expect(row!.intime).toBeNull();
    expect(row!.outtime).toBeNull();
    expect(row!.it1).toBeNull();
    expect(row!.ot1).toBeNull();
  });

  it("mem-parse desimal koma dengan benar", () => {
    const row = result.rows.find((r) => r.tanggal === "2026-08-09");
    expect(row).toBeDefined();
    expect(row!.whour).toBe(0.75);
  });

  it("mem-parse tanggal DD/MM/YYYY dengan benar", () => {
    const row = result.rows.find((r) => r.nik === "2318060259" && r.kategori === "Hari Pendek" && r.rowNumber === 2);
    expect(row).toBeDefined();
    expect(row!.tanggal).toBe("2026-08-01"); // "01/08/2026" -> 1 Agustus, bukan 8 Januari
  });

  it("kategori Hari Libur/Lembur ke-import dengan benar ke kolom kategori", () => {
    const row = result.rows.find((r) => r.kategori === "Hari Libur/Lembur");
    expect(row).toBeDefined();
    expect(row!.tanggal).toBe("2026-08-08");
  });

  it("skip baris Ijin tanpa jam kerja tanpa crash", () => {
    const row = result.rows.find((r) => r.tanggal === "2026-08-10");
    expect(row).toBeDefined();
    expect(row!.kategori).toBe("Ijin");
    expect(row!.intime).toBeNull();
    expect(row!.outtime).toBeNull();
  });

  it("reject baris dengan NIK atau Date kosong, tapi lanjutkan import baris lain", async () => {
    // Bangun workbook kecil terpisah: 1 baris valid + 1 baris NIK kosong + 1 baris Date kosong.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Data Cross Check NK");
    sheet.addRow(["RowNo", "LastDeptname", "NIK", "Nama", "Date", "HK56", "InTime", "OutTime", "IT1", "OT1", "WHour", "BHour", "OTHour", "Description", "QuitDate"]);
    sheet.addRow([1, "DEPT A", "999", "VALID ROW", "11/08/2026", 5, "07:30", "15:30", "07:30", "15:30", 8, 1, 0, "Normal", ""]);
    sheet.addRow([2, "DEPT A", "", "NO NIK", "12/08/2026", 5, "07:30", "15:30", "07:30", "15:30", 8, 1, 0, "Normal", ""]);
    sheet.addRow([3, "DEPT A", "1000", "NO DATE", "", 5, "07:30", "15:30", "07:30", "15:30", 8, 1, 0, "Normal", ""]);
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;

    const parsed = await parseAttendanceImportWorkbook(Buffer.from(buffer));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].nik).toBe("999");
    expect(parsed.rejected).toHaveLength(2);
  });
});
