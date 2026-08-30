import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import { parseOtEstimateSheet } from "@/lib/ot-planning/estimate-import";

const DIVISIONS = [
  { shed: "SHED A", division: "CUTTING" },
  { shed: "SHED A", division: "SEW L1" },
  { shed: "SHED A", division: "ADM PRODUKSI" },
  { shed: "COMMON", division: "WAREHOUSE" },
];

async function buildWorkbook(build: (wb: ExcelJS.Workbook) => void): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buf);
  return loaded;
}

function estimateSheet(wb: ExcelJS.Workbook, rows: (string | number | null)[][]) {
  const s = wb.addWorksheet("Sheet2");
  s.addRow(["No", "Departement/Unit", "Date", "0,5 JAM", "1 JAM", "1,5 JAM", "2 JAM", "3 JAM"]);
  for (const r of rows) s.addRow(r);
}

describe("parseOtEstimateSheet", () => {
  it("memetakan grid ke baris estimasi, section -> shed, '0,5 JAM' -> 0.5", async () => {
    const wb = await buildWorkbook((wb) => {
      wb.addWorksheet("Attendance");
      estimateSheet(wb, [
        ["NO", "DEPARTEMEN SHED A", "28/08/2026", null, null, null, null, null],
        [1, "CUTTING", "28/08/2026", null, null, null, null, null],
        [2, "SEW L1", "28/08/2026", 2, null, null, 4, null],
        ["NO", "DEPARTEMEN COMMON", "28/08/2026", null, null, null, null, null],
        [1, "WAREHOUSE", "28/08/2026", null, 3, null, null, null],
      ]);
    });

    const result = parseOtEstimateSheet(wb, "Attendance", DIVISIONS);
    expect(result.detected).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.rows).toEqual([
      { tanggal: "2026-08-28", shed: "SHED A", division: "SEW L1", duration: 0.5, person: 2 },
      { tanggal: "2026-08-28", shed: "SHED A", division: "SEW L1", duration: 2, person: 4 },
      { tanggal: "2026-08-28", shed: "COMMON", division: "WAREHOUSE", duration: 1, person: 3 },
    ]);
    expect(result.dates).toEqual(["2026-08-28"]);
    expect(result.totalPeople).toBe(9);
  });

  it("melewati unit yang tidak dikenal dan melaporkannya", async () => {
    const wb = await buildWorkbook((wb) => {
      wb.addWorksheet("Attendance");
      estimateSheet(wb, [
        ["NO", "DEPARTEMEN SHED A", "28/08/2026", null, null, null, null, null],
        [1, "UNIT ASING", "28/08/2026", 5, null, null, null, null],
      ]);
    });
    const result = parseOtEstimateSheet(wb, "Attendance", DIVISIONS);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toEqual([
      { rowNumber: 3, shed: "SHED A", unit: "UNIT ASING", reason: "unit tidak dikenal di OT Planning" },
    ]);
  });

  it("melewati baris yang punya nilai tapi kolom Date kosong", async () => {
    const wb = await buildWorkbook((wb) => {
      wb.addWorksheet("Attendance");
      estimateSheet(wb, [
        ["NO", "DEPARTEMEN SHED A", "28/08/2026", null, null, null, null, null],
        [1, "CUTTING", "", 3, null, null, null, null],
      ]);
    });
    const result = parseOtEstimateSheet(wb, "Attendance", DIVISIONS);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("kolom Date kosong / tidak valid");
  });

  it("mendukung beberapa tanggal dalam satu sheet", async () => {
    const wb = await buildWorkbook((wb) => {
      wb.addWorksheet("Attendance");
      estimateSheet(wb, [
        ["NO", "DEPARTEMEN SHED A", "28/08/2026", null, null, null, null, null],
        [1, "CUTTING", "28/08/2026", 2, null, null, null, null],
        [2, "SEW L1", "29/08/2026", 1, null, null, null, null],
      ]);
    });
    const result = parseOtEstimateSheet(wb, "Attendance", DIVISIONS);
    expect(result.dates).toEqual(["2026-08-28", "2026-08-29"]);
  });

  it("detected:false kalau tidak ada sheet grid estimasi", async () => {
    const wb = await buildWorkbook((wb) => {
      const s = wb.addWorksheet("Attendance");
      s.addRow(["NIK", "Nama", "Date"]);
    });
    const result = parseOtEstimateSheet(wb, "Attendance", DIVISIONS);
    expect(result.detected).toBe(false);
    expect(result.reason).toMatch(/tidak ditemukan/i);
  });

  it("reason khusus kalau grid ada tapi kolom Date hilang", async () => {
    const wb = await buildWorkbook((wb) => {
      wb.addWorksheet("Attendance");
      const s = wb.addWorksheet("Sheet2");
      s.addRow(["No", "Departement/Unit", "0,5 JAM", "1 JAM", "2 JAM"]);
      s.addRow([1, "CUTTING", 2, null, null]);
    });
    const result = parseOtEstimateSheet(wb, "Attendance", DIVISIONS);
    expect(result.detected).toBe(true);
    expect(result.reason).toMatch(/Date/);
    expect(result.rows).toHaveLength(0);
  });
});
