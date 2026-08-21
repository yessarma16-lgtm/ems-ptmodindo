import XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { normalizeExcelBuffer } from "@/lib/excel-import";

describe("Excel import format support", () => {
  it("converts a legacy .xls workbook to a buffer ExcelJS can read", async () => {
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([["NIK", "Nama"], ["1001", "Test"]]), "Data");
    const xls = Buffer.from(XLSX.write(source, { type: "buffer", bookType: "xls" }));

    const normalized = normalizeExcelBuffer(xls);
    const converted = XLSX.read(normalized, { type: "buffer" });

    expect(converted.SheetNames).toEqual(["Data"]);
    expect(XLSX.utils.sheet_to_json(converted.Sheets.Data, { header: 1 })).toEqual([["NIK", "Nama"], ["1001", "Test"]]);
  });

  it("leaves modern .xlsx buffers unchanged", () => {
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([["Header"]]), "Sheet1");
    const xlsx = Buffer.from(XLSX.write(source, { type: "buffer", bookType: "xlsx" }));

    expect(normalizeExcelBuffer(xlsx)).toBe(xlsx);
  });
});
