import "server-only";

import * as XLSX from "xlsx";

/** Converts legacy binary .xls workbooks to the .xlsx buffer expected by ExcelJS. */
export function normalizeExcelBuffer(buffer: Buffer): Buffer {
  // OLE Compound File signature used by legacy .xls files.
  const isLegacyXls = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!isLegacyXls) return buffer;

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
