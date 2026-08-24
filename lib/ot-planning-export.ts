import "server-only";

import ExcelJS from "exceljs";
// The standalone build embeds the standard fonts. The regular Node build
// resolves Helvetica.afm from the package filesystem, which is not reliable
// after Next.js bundles the route for deployment.
// @ts-expect-error pdfkit does not ship a declaration for its standalone entry.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

export type OtPlanningReport = {
  shed: string;
  config: { umr: number; usdRate: number; divisor: number; multipliers?: Record<string, number> };
  rows: { division: string; cells: { duration: number; estimated: number; actual: number }[] }[];
};
export type OtPlanningReferences = { mappings: Array<{ attendance_department: string; shed: string; division: string; display_order: number }>; divisions: Array<{ shed: string; division: string; display_order: number }>; multipliers: Array<{ duration: number; paid_hours: number }>; };

const navy = "FF1F4E78";
const lightBlue = "FFD9EAF7";
const border = { style: "thin" as const, color: { argb: "FF808080" } };
const moneyFormat = "#,##0;[Red]-#,##0;-";
const usdFormat = "$#,##0.00;[Red]-$#,##0.00;-";
const colLetter = (number: number) => { let value = ""; while (number > 0) { const remainder = (number - 1) % 26; value = String.fromCharCode(65 + remainder) + value; number = Math.floor((number - 1) / 26); } return value; };
const paidHours = (duration: number) => 1.5 * Math.min(duration, 1) + 2 * Math.max(duration - 1, 0);

export function getOtDurations(report: OtPlanningReport) {
  const values = Array.from(new Set(report.rows.flatMap((row) => row.cells.map((cell) => cell.duration)))).sort((a, b) => a - b);
  return values.length ? values : [0.5, 1];
}

function rate(report: OtPlanningReport, duration: number) {
  return report.config.umr / report.config.divisor * (report.config.multipliers?.[String(duration)] ?? paidHours(duration));
}

function rowValues(report: OtPlanningReport, row: OtPlanningReport["rows"][number], durations: number[], index: number) {
  const cells = durations.map((duration) => row.cells.find((cell) => cell.duration === duration) ?? { duration, estimated: 0, actual: 0 });
  const estimatedTotal = cells.reduce((sum, cell) => sum + cell.estimated * rate(report, cell.duration), 0);
  const actualTotal = cells.reduce((sum, cell) => sum + cell.actual * rate(report, cell.duration), 0);
  return [index + 1, row.division, ...cells.flatMap((cell) => [cell.estimated, cell.estimated * rate(report, cell.duration), cell.actual, cell.actual * rate(report, cell.duration)]), cells.reduce((sum, cell) => sum + cell.estimated, 0), estimatedTotal, estimatedTotal / report.config.usdRate, cells.reduce((sum, cell) => sum + cell.actual, 0), actualTotal, actualTotal / report.config.usdRate];
}

export async function buildOtPlanningWorkbook(date: string, reports: OtPlanningReport[], references?: OtPlanningReferences) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MET OT Planning";
  const reference = workbook.addWorksheet("Reference");
  reference.getCell("B2").value = "Reference Bracket";
  reference.getCell("B4").value = "Effective Date"; reference.getCell("C4").value = date;
  reference.getCell("B5").value = "UMR"; reference.getCell("C5").value = reports[0]?.config.umr ?? 0;
  reference.getCell("B6").value = "USD Rate"; reference.getCell("C6").value = reports[0]?.config.usdRate ?? 0;
  reference.getCell("B7").value = "Divisor"; reference.getCell("C7").value = reports[0]?.config.divisor ?? 173;
  reference.getCell("B10").value = "Overtime Reference"; reference.getCell("B11").value = "Duration"; reference.getCell("C11").value = "Paid Hour";
  const multiplierRows = references?.multipliers?.length ? references.multipliers : Array.from({ length: 26 }, (_, i) => ({ duration: (i + 1) / 2, paid_hours: paidHours((i + 1) / 2) }));
  multiplierRows.forEach((item, index) => { reference.getCell(`B${12 + index}`).value = `${item.duration.toString().replace(".", ",")} JAM`; reference.getCell(`C${12 + index}`).value = item.paid_hours; });
  let refRow = 40; reference.getCell(`B${refRow}`).value = "Department Mapping"; refRow++; ["Attendance Department", "Shed", "Division", "Source"].forEach((value, index) => reference.getCell(`${colLetter(2 + index)}${refRow}`).value = value); refRow++;
  (references?.mappings ?? []).forEach((item) => { reference.getCell(`B${refRow}`).value = item.attendance_department; reference.getCell(`C${refRow}`).value = item.shed; reference.getCell(`D${refRow}`).value = item.division; reference.getCell(`E${refRow}`).value = "OT Planning Reference"; refRow++; });
  reference.getColumn(2).width = 30; reference.getColumn(3).width = 18; reference.getColumn(4).width = 24; reference.getColumn(5).width = 28;
  reference.eachRow((row) => row.eachCell((cell) => { cell.border = { top: border, left: border, bottom: border, right: border }; }));
  const sheet = workbook.addWorksheet("OT Planning");
  sheet.views = [{ state: "frozen", ySplit: 6, xSplit: 2 }];
  sheet.getCell("A1").value = `OT PLANNING ${date}`;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;
  const col = (number: number) => sheet.getColumn(number).letter;
  let startRow = 4;
  for (const report of reports) {
    const durations = getOtDurations(report);
    const totalStart = 3 + durations.length * 4;
    const totalEnd = totalStart + 5;
    const headerRow = startRow;
    const subHeaderRow = startRow + 1;
    const labelRow = startRow + 2;
    sheet.getCell(`${col(1)}${headerRow}`).value = "NO";
    sheet.getCell(`${col(2)}${headerRow}`).value = `DEPARTEMEN ${report.shed}`;
    sheet.mergeCells(`${col(1)}${headerRow}:${col(1)}${labelRow}`);
    sheet.mergeCells(`${col(2)}${headerRow}:${col(2)}${labelRow}`);
    durations.forEach((duration, index) => {
      const first = 3 + index * 4;
      sheet.mergeCells(`${col(first)}${subHeaderRow}:${col(first + 1)}${subHeaderRow}`);
      sheet.mergeCells(`${col(first + 2)}${subHeaderRow}:${col(first + 3)}${subHeaderRow}`);
      sheet.getCell(`${col(first)}${subHeaderRow}`).value = "Estimated";
      sheet.getCell(`${col(first + 2)}${subHeaderRow}`).value = "Actual";
      sheet.getCell(`${col(first)}${labelRow}`).value = `${duration.toString().replace(".", ",")} JAM`;
      sheet.getCell(`${col(first + 1)}${labelRow}`).value = "BUDGET";
      sheet.getCell(`${col(first + 2)}${labelRow}`).value = `${duration.toString().replace(".", ",")} JAM`;
      sheet.getCell(`${col(first + 3)}${labelRow}`).value = "BUDGET";
    });
    sheet.mergeCells(`${col(totalStart)}${headerRow}:${col(totalStart + 2)}${headerRow}`);
    sheet.mergeCells(`${col(totalStart + 3)}${headerRow}:${col(totalEnd)}${headerRow}`);
    sheet.getCell(`${col(totalStart)}${headerRow}`).value = "TOTAL OVERTIME ESTIMATED";
    sheet.getCell(`${col(totalStart + 3)}${headerRow}`).value = "TOTAL OVERTIME ACTUAL";
    [totalStart, totalStart + 1, totalStart + 2, totalStart + 3, totalStart + 4, totalEnd].forEach((number) => sheet.mergeCells(`${col(number)}${subHeaderRow}:${col(number)}${labelRow}`));
    ["TOTAL PERSON", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD", "TOTAL PERSON", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD"].forEach((label, index) => { sheet.getCell(`${col(totalStart + index)}${subHeaderRow}`).value = label; });
    for (let row = headerRow; row <= labelRow; row++) for (let column = 1; column <= totalEnd; column++) { const cell = sheet.getCell(row, column); cell.border = { top: border, left: border, bottom: border, right: border }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === headerRow ? navy : lightBlue } }; cell.font = { bold: true, color: { argb: row === headerRow ? "FFFFFFFF" : "FF000000" } }; }
    const dataStart = labelRow + 1;
    report.rows.forEach((row, index) => { const values = rowValues(report, row, durations, index); const excelRow = sheet.addRow(values); durations.forEach((duration, durationIndex) => { const first = 3 + durationIndex * 4; const ref = `VLOOKUP(${col(first)}$${labelRow},Reference!$B$12:$C$37,2,FALSE)`; excelRow.getCell(first + 1).value = { formula: `${col(first)}${excelRow.number}*(Reference!$C$5/Reference!$C$7)*${ref}`, result: values[first + 1] as number }; excelRow.getCell(first + 3).value = { formula: `${col(first + 2)}${excelRow.number}*(Reference!$C$5/Reference!$C$7)*${ref}`, result: values[first + 3] as number }; }); const estimatedPeople = durations.map((_, i) => `${col(3 + i * 4)}${excelRow.number}`); const estimatedBudget = durations.map((_, i) => `${col(4 + i * 4)}${excelRow.number}`); const actualPeople = durations.map((_, i) => `${col(5 + i * 4)}${excelRow.number}`); const actualBudget = durations.map((_, i) => `${col(6 + i * 4)}${excelRow.number}`); excelRow.getCell(totalStart).value = { formula: `SUM(${estimatedPeople.join(",")})`, result: values[totalStart] as number }; excelRow.getCell(totalStart + 1).value = { formula: `SUM(${estimatedBudget.join(",")})`, result: values[totalStart + 1] as number }; excelRow.getCell(totalStart + 2).value = { formula: `${col(totalStart + 1)}${excelRow.number}/Reference!$C$6`, result: values[totalStart + 2] as number }; excelRow.getCell(totalStart + 3).value = { formula: `SUM(${actualPeople.join(",")})`, result: values[totalStart + 3] as number }; excelRow.getCell(totalStart + 4).value = { formula: `SUM(${actualBudget.join(",")})`, result: values[totalStart + 4] as number }; excelRow.getCell(totalEnd).value = { formula: `${col(totalStart + 4)}${excelRow.number}/Reference!$C$6`, result: values[totalEnd] as number }; excelRow.eachCell((cell, column) => { cell.border = { top: border, left: border, bottom: border, right: border }; cell.alignment = { vertical: "middle", horizontal: column <= 2 ? "left" : "right" }; if (column >= 4) cell.numFmt = column % 4 === 0 ? moneyFormat : column > totalStart + 1 && column <= totalEnd ? moneyFormat : "#,##0.##"; }); [totalStart + 2, totalEnd].forEach((column) => { excelRow.getCell(column).numFmt = usdFormat; }); });
    const totalRow = sheet.addRow([null, `TOTAL ${report.shed}`]);
    for (let column = 3; column <= totalEnd; column++) { const cell = totalRow.getCell(column); cell.value = { formula: `SUM(${col(column)}${dataStart}:${col(column)}${totalRow.number - 1})` }; cell.numFmt = column === totalStart + 2 || column === totalEnd ? usdFormat : column % 4 === 0 || column === totalStart + 1 || column === totalStart + 4 ? moneyFormat : "#,##0.##"; }
    totalRow.eachCell((cell) => { cell.border = { top: border, left: border, bottom: border, right: border }; cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } }; });
    startRow = totalRow.number + 3;
  }
  const titleEnd = Math.max(16, ...reports.map((report) => 3 + getOtDurations(report).length * 4 + 5));
  sheet.mergeCells(`A1:${sheet.getColumn(titleEnd).letter}1`);
  sheet.getColumn(1).width = 7; sheet.getColumn(2).width = 24;
  for (let column = 3; column <= sheet.columnCount; column++) sheet.getColumn(column).width = 15;
  sheet.eachRow((row) => { row.height = Math.max(row.height ?? 15, 20); });
  return workbook;
}

export async function buildOtPlanningPdf(date: string, reports: OtPlanningReport[]) {
  const document = new PDFDocument({ size: "A3", layout: "landscape", margin: 24, bufferPages: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { document.on("data", (chunk: Buffer) => chunks.push(chunk)); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  const pageWidth = 1191 - 48;
  document.font("Helvetica");
  document.fontSize(16).fillColor("#ffffff").rect(24, 24, pageWidth, 28).fill("#1f4e78").text(`OT PLANNING ${date}`, 24, 31, { width: pageWidth, align: "center" });
  let y = 70;
  for (const report of reports) {
    const durations = getOtDurations(report);
    const columns = ["NO", `DEPARTEMEN ${report.shed}`, ...durations.flatMap((duration) => [`${duration} JAM\nESTIMATED`, "BUDGET IDR", `${duration} JAM\nACTUAL`, "BUDGET IDR"]), "TOTAL PERSON\nESTIMATED", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD", "TOTAL PERSON\nACTUAL", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD"];
    const widths = columns.map((_, index) => index === 0 ? 32 : index === 1 ? 130 : 58);
    const scale = Math.min(1, pageWidth / widths.reduce((sum, width) => sum + width, 0));
    const scaled = widths.map((width) => width * scale);
    const lineHeight = 22;
    const drawRow = (values: unknown[], fill: string, bold = false) => { let x = 24; document.fontSize(7).font(bold ? "Helvetica-Bold" : "Helvetica"); values.forEach((value, index) => { const width = scaled[index]; document.fillColor(fill).rect(x, y, width, lineHeight).fillAndStroke(fill, "#808080"); document.fillColor("#000000").text(String(value ?? ""), x + 2, y + 5, { width: width - 4, height: lineHeight - 4, align: index < 2 ? "left" : "right", lineBreak: false }); x += width; }); y += lineHeight; };
    drawRow(["NO", `DEPARTEMEN ${report.shed}`, ...durations.flatMap(() => ["Estimated", "", "Actual", ""]), "TOTAL OVERTIME ESTIMATED", "", "", "TOTAL OVERTIME ACTUAL", "", ""], "#1f4e78", true);
    drawRow(["", "", ...durations.flatMap(() => ["", "", "", ""]), "TOTAL PERSON", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD", "TOTAL PERSON", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD"], "#d9eaf7", true);
    drawRow(["", "", ...durations.flatMap((duration) => [`${duration} JAM`, "BUDGET", `${duration} JAM`, "BUDGET"]), "", "", "", "", "", ""], "#d9eaf7", true);
    report.rows.forEach((row, index) => { if (y + lineHeight > 810) { document.addPage(); y = 24; } drawRow(rowValues(report, row, durations, index).map((value) => typeof value === "number" ? value.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : value), "#ffffff"); });
    const totals = report.rows.reduce((sum, row, index) => { const values = rowValues(report, row, durations, index); return values.map((value, column) => column < 2 ? (column === 1 ? "TOTAL" : "") : typeof value === "number" ? (sum[column] as number ?? 0) + value : ""); }, [] as (number | string)[]);
    if (y + lineHeight > 810) { document.addPage(); y = 24; } drawRow(totals, "#d9eaf7", true);
    y += 18;
  }
  document.end();
  return result;
}
