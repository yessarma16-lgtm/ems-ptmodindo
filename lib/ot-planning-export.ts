import "server-only";

import ExcelJS from "exceljs";
// The standalone build embeds the standard fonts. The regular Node build
// resolves Helvetica.afm from the package filesystem, which is not reliable
// after Next.js bundles the route for deployment.
// @ts-expect-error pdfkit does not ship a declaration for its standalone entry.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import type { OtPlanningDaySnapshot } from "@/lib/ot-planning-service";

export type OtPlanningReport = {
  shed: string;
  config: { umr: number; usdRate: number; divisor: number; multipliers?: Record<string, number> };
  rows: { division: string; cells: { duration: number; estimated: number; actual: number }[] }[];
};

const navy = "FF1F4E78";
const lightBlue = "FFD9EAF7";
const border = { style: "thin" as const, color: { argb: "FF808080" } };
const moneyFormat = "#,##0;[Red]-#,##0;-";
const usdFormat = "$#,##0.00;[Red]-$#,##0.00;-";
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

function styleHeaderCell(cell: ExcelJS.Cell, fill: string) {
  cell.border = { top: border, left: border, bottom: border, right: border };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.font = { bold: true, color: { argb: fill === navy ? "FFFFFFFF" : "FF000000" } };
}

function styleHeaderRow(row: ExcelJS.Row, fill: string) {
  row.eachCell((cell) => styleHeaderCell(cell, fill));
}

function titleRow(sheet: ExcelJS.Worksheet, text: string, spanColumns: number) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, spanColumns);
  row.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  row.height = 24;
  return row;
}

/** OT Planning's own per-shed department -> division/Unit mapping, used to roll same-named
 * categories (CUTTING/QC/MEKANIK/FINISHING/ADM PRODUKSI) across SHED A/B/C into one summed
 * row for Recap/Recap Per Department, while SEW L* lines (already unique per shed) stay
 * split and COMMON's own units are never rolled up (they have no cross-shed duplicates). */
const ROLLUP_CATEGORIES = ["CUTTING", "ADM PRODUKSI", "QC", "MEKANIK", "FINISHING"];
const PRODUCTION_SHEDS = ["SHED A", "SHED B", "SHED C"];

function sewLineSortKey(division: string): number | null {
  const match = division.match(/^SEW L(\d+)([A-Z])?$/i);
  if (!match) return null;
  const letter = match[2];
  const fraction = letter ? (letter.toUpperCase().charCodeAt(0) - 64) / 10 : 0; // A -> .1, B -> .2, ...
  return Number(match[1]) + fraction;
}

/** Merges same-named rows across SHED A/B/C into one, summing every duration cell — the
 * flat, shed-agnostic list the Recap sheet shows (COMMON's own units are untouched). */
function buildRecapRows(reports: OtPlanningReport[]): { division: string; cells: { duration: number; estimated: number; actual: number }[] }[] {
  const common = reports.find((r) => r.shed === "COMMON");
  const production = reports.filter((r) => PRODUCTION_SHEDS.includes(r.shed));

  const mergeCells = (cellSets: { duration: number; estimated: number; actual: number }[][]) => {
    const merged = new Map<number, { duration: number; estimated: number; actual: number }>();
    for (const cells of cellSets) {
      for (const cell of cells) {
        const current = merged.get(cell.duration) ?? { duration: cell.duration, estimated: 0, actual: 0 };
        current.estimated += cell.estimated;
        current.actual += cell.actual;
        merged.set(cell.duration, current);
      }
    }
    return Array.from(merged.values()).sort((a, b) => a.duration - b.duration);
  };

  const rows: { division: string; cells: { duration: number; estimated: number; actual: number }[] }[] = [];

  // COMMON's own units first, as-is (no rollup applies there).
  if (common) for (const row of common.rows) rows.push({ division: row.division, cells: row.cells });

  // CUTTING, summed across production sheds.
  const cutting = production.flatMap((r) => r.rows.filter((row) => row.division === "CUTTING").map((row) => row.cells));
  if (cutting.length) rows.push({ division: "CUTTING", cells: mergeCells(cutting) });

  // Every SEW L* line across production sheds — each name is already unique, just sorted numerically.
  const sewLines = production.flatMap((r) => r.rows.filter((row) => sewLineSortKey(row.division) !== null));
  sewLines.sort((a, b) => sewLineSortKey(a.division)! - sewLineSortKey(b.division)!);
  for (const row of sewLines) rows.push({ division: row.division, cells: row.cells });

  // CNC (Shed C only, no rollup needed).
  const cnc = production.flatMap((r) => r.rows.filter((row) => row.division === "CNC").map((row) => row.cells));
  if (cnc.length) rows.push({ division: "CNC", cells: mergeCells(cnc) });

  // ADM PRODUKSI / QC / MEKANIK / FINISHING, each summed across production sheds.
  for (const category of ROLLUP_CATEGORIES.filter((c) => c !== "CUTTING")) {
    const matches = production.flatMap((r) => r.rows.filter((row) => row.division === category).map((row) => row.cells));
    if (matches.length) rows.push({ division: category, cells: mergeCells(matches) });
  }

  return rows;
}

function writeReportTable(sheet: ExcelJS.Worksheet, startRow: number, label: string, config: OtPlanningReport["config"], durations: number[], rows: { division: string; cells: { duration: number; estimated: number; actual: number }[] }[]): number {
  const virtualReport: OtPlanningReport = { shed: "", config, rows: [] };
  const totalStart = 3 + durations.length * 4;
  const totalEnd = totalStart + 5;
  const headerRow = startRow;
  const subHeaderRow = startRow + 1;
  const labelRow = startRow + 2;

  sheet.getCell(headerRow, 1).value = "NO";
  sheet.getCell(headerRow, 2).value = label;
  sheet.mergeCells(headerRow, 1, labelRow, 1);
  sheet.mergeCells(headerRow, 2, labelRow, 2);
  durations.forEach((duration, index) => {
    const first = 3 + index * 4;
    sheet.mergeCells(subHeaderRow, first, subHeaderRow, first + 1);
    sheet.mergeCells(subHeaderRow, first + 2, subHeaderRow, first + 3);
    sheet.getCell(subHeaderRow, first).value = "Estimated";
    sheet.getCell(subHeaderRow, first + 2).value = "Actual";
    sheet.getCell(labelRow, first).value = `${duration.toString().replace(".", ",")} JAM`;
    sheet.getCell(labelRow, first + 1).value = "BUDGET";
    sheet.getCell(labelRow, first + 2).value = `${duration.toString().replace(".", ",")} JAM`;
    sheet.getCell(labelRow, first + 3).value = "BUDGET";
  });
  sheet.mergeCells(headerRow, totalStart, headerRow, totalStart + 2);
  sheet.mergeCells(headerRow, totalStart + 3, headerRow, totalEnd);
  sheet.getCell(headerRow, totalStart).value = "TOTAL OVERTIME ESTIMATED";
  sheet.getCell(headerRow, totalStart + 3).value = "TOTAL OVERTIME ACTUAL";
  [totalStart, totalStart + 1, totalStart + 2, totalStart + 3, totalStart + 4, totalEnd].forEach((column) => sheet.mergeCells(subHeaderRow, column, labelRow, column));
  ["TOTAL PERSON", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD", "TOTAL PERSON", "TOTAL ESTIMASI IDR", "TOTAL ESTIMASI USD"].forEach((text, index) => { sheet.getCell(subHeaderRow, totalStart + index).value = text; });
  for (let row = headerRow; row <= labelRow; row++) for (let column = 1; column <= totalEnd; column++) styleHeaderCell(sheet.getCell(row, column), row === headerRow ? navy : lightBlue);

  const dataStart = labelRow + 1;
  rows.forEach((row, index) => {
    const values = rowValues(virtualReport, row, durations, index);
    const excelRow = sheet.addRow(values);
    excelRow.eachCell((cell, column) => {
      cell.border = { top: border, left: border, bottom: border, right: border };
      cell.alignment = { vertical: "middle", horizontal: column <= 2 ? "left" : "right" };
      if (column >= 4) cell.numFmt = column % 4 === 0 ? moneyFormat : column > totalStart + 1 && column <= totalEnd ? moneyFormat : "#,##0.##";
    });
    [totalStart + 2, totalEnd].forEach((column) => { excelRow.getCell(column).numFmt = usdFormat; });
  });

  const totalRowNumber = dataStart + rows.length;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.getCell(2).value = `TOTAL ${label}`;
  for (let column = 3; column <= totalEnd; column++) {
    let sum = 0;
    for (let r = dataStart; r < totalRowNumber; r++) sum += Number(sheet.getCell(r, column).value ?? 0) || 0;
    const cell = totalRow.getCell(column);
    cell.value = sum;
    cell.numFmt = column === totalStart + 2 || column === totalEnd ? usdFormat : column % 4 === 0 || column === totalStart + 1 || column === totalStart + 4 ? moneyFormat : "#,##0.##";
  }
  totalRow.eachCell((cell) => { cell.border = { top: border, left: border, bottom: border, right: border }; cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } }; });
  totalRow.commit();

  return totalRowNumber;
}

function buildMainSheet(workbook: ExcelJS.Workbook, date: string, reports: OtPlanningReport[]) {
  const sheet = workbook.addWorksheet("OT Planning");
  sheet.views = [{ state: "frozen", ySplit: 6, xSplit: 2 }];
  sheet.getCell("A1").value = `OT PLANNING ${date}`;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;

  let startRow = 4;
  for (const report of reports) {
    const durations = getOtDurations(report);
    const lastRow = writeReportTable(sheet, startRow, `DEPARTEMEN ${report.shed}`, report.config, durations, report.rows);
    startRow = lastRow + 3;
  }

  const titleEnd = Math.max(16, ...reports.map((report) => 3 + getOtDurations(report).length * 4 + 5));
  sheet.mergeCells(`A1:${sheet.getColumn(titleEnd).letter}1`);
  sheet.getColumn(1).width = 7; sheet.getColumn(2).width = 24;
  for (let column = 3; column <= sheet.columnCount; column++) sheet.getColumn(column).width = 15;
  sheet.eachRow((row) => { row.height = Math.max(row.height ?? 15, 20); });
}

function buildRecapSheet(workbook: ExcelJS.Workbook, date: string, reports: OtPlanningReport[]) {
  const sheet = workbook.addWorksheet("Recap");
  const rows = buildRecapRows(reports);
  const durations = Array.from(new Set(reports.flatMap((r) => getOtDurations(r)))).sort((a, b) => a - b);
  const config = reports[0]?.config ?? { umr: 0, usdRate: 1, divisor: 173 };
  const titleEnd = Math.max(16, 3 + durations.length * 4 + 5);

  const title = titleRow(sheet, `RECAP ${date}`, titleEnd);
  writeReportTable(sheet, title.number + 1, "ALL UNITS", config, durations, rows);

  sheet.getColumn(1).width = 7; sheet.getColumn(2).width = 30;
  for (let column = 3; column <= sheet.columnCount; column++) sheet.getColumn(column).width = 15;
  sheet.eachRow((row) => { row.height = Math.max(row.height ?? 15, 20); });
}

/** Sum of actual person-count / IDR / USD across every division and duration in one day's report for the given shed(s). */
function actualTotalsForSheds(dayReports: OtPlanningReport[], sheds: string[], divisionFilter?: (division: string) => boolean) {
  let persons = 0, idr = 0, usdRate = 1;
  for (const report of dayReports) {
    if (!sheds.includes(report.shed)) continue;
    usdRate = report.config.usdRate || usdRate;
    for (const row of report.rows) {
      if (divisionFilter && !divisionFilter(row.division)) continue;
      for (const cell of row.cells) { persons += cell.actual; idr += cell.actual * rate(report, cell.duration); }
    }
  }
  return { persons, idr, usd: idr / usdRate };
}

/** Sum of estimated+actual person-count / IDR / USD across every shed/division/duration in one day's report. */
function planningTotalsForDay(dayReports: OtPlanningReport[]) {
  let estPersons = 0, estIdr = 0, actPersons = 0, actIdr = 0, usdRate = 1;
  for (const report of dayReports) {
    usdRate = report.config.usdRate || usdRate;
    for (const row of report.rows) {
      for (const cell of row.cells) {
        estPersons += cell.estimated; estIdr += cell.estimated * rate(report, cell.duration);
        actPersons += cell.actual; actIdr += cell.actual * rate(report, cell.duration);
      }
    }
  }
  return { estPersons, estIdr, estUsd: estIdr / usdRate, actPersons, actIdr, actUsd: actIdr / usdRate };
}

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }).replace(/ /g, "-");
}

function buildRecapPerDaySheet(workbook: ExcelJS.Workbook, monthToDate: OtPlanningDaySnapshot[]) {
  const sheet = workbook.addWorksheet("Recapitulation Per Day");
  sheet.columns = [{ width: 6 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }];

  titleRow(sheet, "RECAPITULATION PER DAY OF MONTHLY NUMBER", 8);
  const headerRow1 = sheet.addRow(["NO", "DATE", "Planning", "", "", "Actual", "", ""]);
  const headerRow2 = sheet.addRow(["", "", "NO OF WORKERS", "COST/DAY IDR", "COST/DAY $", "NO OF WORKERS", "COST/DAY IDR", "COST/DAY $"]);
  sheet.mergeCells(headerRow1.number, 1, headerRow2.number, 1);
  sheet.mergeCells(headerRow1.number, 2, headerRow2.number, 2);
  sheet.mergeCells(headerRow1.number, 3, headerRow1.number, 5);
  sheet.mergeCells(headerRow1.number, 6, headerRow1.number, 8);
  styleHeaderRow(headerRow1, navy);
  styleHeaderRow(headerRow2, lightBlue);

  monthToDate.forEach((day, index) => {
    const totals = planningTotalsForDay(day.reports);
    const row = sheet.addRow([index + 1, formatDayLabel(day.date), totals.estPersons || "", totals.estIdr || "", totals.estUsd || "", totals.actPersons || "", totals.actIdr || "", totals.actUsd || ""]);
    row.eachCell((cell, column) => {
      cell.border = { top: border, left: border, bottom: border, right: border };
      cell.alignment = { horizontal: column <= 2 ? "left" : "center", vertical: "middle" };
      if (column === 4 || column === 7) cell.numFmt = moneyFormat;
      if (column === 5 || column === 8) cell.numFmt = usdFormat;
    });
  });
}

function buildRecapPerDepartmentSheet(workbook: ExcelJS.Workbook, dateTo: string, monthToDate: OtPlanningDaySnapshot[]) {
  const sheet = workbook.addWorksheet("Recap Per Department");
  const dayCount = monthToDate.length;
  const columnsPerDay = 2;
  const lastColumn = 2 + dayCount * columnsPerDay + columnsPerDay; // +1 trailing IDR/USD grand-total pair
  const totalIdrColumn = lastColumn - 1;
  const totalUsdColumn = lastColumn;
  sheet.getColumn(1).width = 6; sheet.getColumn(2).width = 30;
  for (let c = 3; c <= lastColumn; c++) sheet.getColumn(c).width = 14;

  const rangeLabel = `1-${new Date(`${dateTo}T00:00:00`).getDate()} ${new Date(`${dateTo}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase()}`;
  titleRow(sheet, `ACTUAL OVERTIME ${rangeLabel}`, lastColumn);

  function writeDepartmentBlock(label: string, categoryRows: { name: string; totals: (day: OtPlanningDaySnapshot) => { idr: number; usd: number } }[]) {
    const dayHeaderRow = sheet.addRow(["", "1 USD = IDR 16,000", ...monthToDate.flatMap((day) => [new Date(`${day.date}T00:00:00`).getDate(), ""]), "TOTAL", ""]);
    monthToDate.forEach((_, i) => sheet.mergeCells(dayHeaderRow.number, 3 + i * 2, dayHeaderRow.number, 4 + i * 2));
    sheet.mergeCells(dayHeaderRow.number, totalIdrColumn, dayHeaderRow.number, totalUsdColumn);
    styleHeaderRow(dayHeaderRow, lightBlue);

    const colHeaderRow = sheet.addRow(["NO", label, ...monthToDate.flatMap(() => ["TOTAL ESTIMATION IDR", "ESTIMASI USD"]), "TOTAL ESTIMATION IDR", "ESTIMASI USD"]);
    styleHeaderRow(colHeaderRow, navy);

    const dataStart = colHeaderRow.number + 1;
    categoryRows.forEach((category, index) => {
      const perDay = monthToDate.map((day) => category.totals(day));
      const values = perDay.flatMap((t) => [t.idr || "", t.usd || ""]);
      const grandIdr = perDay.reduce((sum, t) => sum + t.idr, 0);
      const grandUsd = perDay.reduce((sum, t) => sum + t.usd, 0);
      const row = sheet.addRow([index + 1, category.name, ...values, grandIdr || "", grandUsd || ""]);
      row.eachCell((cell, column) => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { horizontal: column <= 2 ? "left" : "center", vertical: "middle" };
        if (column >= 3) cell.numFmt = column % 2 === 1 ? moneyFormat : usdFormat;
      });
    });
    const totalRowNumber = dataStart + categoryRows.length;
    const totalRow = sheet.getRow(totalRowNumber);
    totalRow.getCell(2).value = `TOTAL UNIT ${label}`;
    for (let column = 3; column <= lastColumn; column++) {
      let sum = 0;
      for (let r = dataStart; r < totalRowNumber; r++) sum += Number(sheet.getCell(r, column).value ?? 0) || 0;
      const cell = totalRow.getCell(column);
      cell.value = sum;
      cell.numFmt = column % 2 === 1 ? moneyFormat : usdFormat;
    }
    totalRow.eachCell((cell) => { cell.border = { top: border, left: border, bottom: border, right: border }; cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } }; });
    sheet.addRow([]);
    return totalRowNumber;
  }

  const rollupCategory = (name: string, shed: string, matcher: (division: string) => boolean) => ({
    name,
    totals: (day: OtPlanningDaySnapshot) => { const t = actualTotalsForSheds(day.reports, [shed], matcher); return { idr: t.idr, usd: t.usd }; },
  });

  const shedTotalRows: number[] = [];
  const shedLabels: { shed: string; unitLabel: string; categories: string[] }[] = [
    { shed: "SHED A", unitLabel: "DEPARTEMENT UNIT 1", categories: ["CUTTING", "SEWING A L1 - L12", "ADM PRODUKSI", "QC", "MEKANIK", "FINISHING"] },
    { shed: "SHED B", unitLabel: "DEPARTEMENT UNIT 2", categories: ["CUTTING", "SEWING B L13 - L22", "ADM PRODUKSI", "QC", "MEKANIK", "FINISHING"] },
    { shed: "SHED C", unitLabel: "DEPARTEMENT UNIT 3", categories: ["CUTTING", "SEWING C L23 - 32", "CNC", "ADM PRODUKSI", "QC", "MEKANIK", "FINISHING"] },
  ];

  for (const { shed, unitLabel, categories } of shedLabels) {
    const rows = categories.map((label) => {
      if (label.startsWith("SEWING ")) return rollupCategory(label, shed, (division) => sewLineSortKey(division) !== null);
      return rollupCategory(label, shed, (division) => division === label);
    });
    shedTotalRows.push(writeDepartmentBlock(unitLabel, rows));
  }

  // COMMON keeps its own actual unit list — no cross-shed rollup applies there.
  const commonDivisions = Array.from(new Set(monthToDate.flatMap((day) => day.reports.find((r) => r.shed === "COMMON")?.rows.map((r) => r.division) ?? [])));
  const commonRows = commonDivisions.map((division) => rollupCategory(division, "COMMON", (d) => d === division));
  const commonTotalRow = writeDepartmentBlock("COMMON", commonRows);

  function sumRows(rowNumbers: number[]) {
    return (column: number) => rowNumbers.reduce((sum, r) => sum + (Number(sheet.getCell(r, column).value ?? 0) || 0), 0);
  }

  const productionSum = sumRows(shedTotalRows);
  const sampleRows = commonDivisions
    .map((division, index) => ({ division, row: commonTotalRow - commonRows.length + index }))
    .filter((x) => x.division.toUpperCase().includes("SAMPLE"))
    .map((x) => x.row);
  const sampleSum = sumRows(sampleRows.length ? sampleRows : [commonTotalRow]);
  const allSum = sumRows([...shedTotalRows, commonTotalRow]);

  function writeFooterRow(label: string, sumFn: (column: number) => number) {
    const row = sheet.addRow([label]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    for (let column = 3; column <= lastColumn; column++) { const cell = row.getCell(column); cell.value = sampleRows.length || label !== "TOTAL STAFF OPERATOR SAMPLE" ? sumFn(column) : 0; cell.numFmt = column % 2 === 1 ? moneyFormat : usdFormat; cell.border = { top: border, left: border, bottom: border, right: border }; }
    row.getCell(1).font = { bold: true };
    row.eachCell((cell) => { cell.border = { top: border, left: border, bottom: border, right: border }; });
    return row;
  }

  writeFooterRow("TOTAL PRODUKSI WORKER", productionSum);
  writeFooterRow("TOTAL STAFF OPERATOR SAMPLE", sampleSum);
  writeFooterRow("TOTAL ALL", allSum);
}

function buildAccountingReportSheet(workbook: ExcelJS.Workbook, monthToDate: OtPlanningDaySnapshot[]) {
  const sheet = workbook.addWorksheet("Accounting Report");
  const lastColumn = 1 + monthToDate.length * 2 + 2;
  sheet.getColumn(1).width = 30;
  for (let c = 2; c <= lastColumn; c++) sheet.getColumn(c).width = 12;

  const dateHeaderRow = sheet.addRow(["Date", ...monthToDate.flatMap((day) => [new Date(`${day.date}T00:00:00`).getDate(), ""]), "TOTAL", ""]);
  monthToDate.forEach((_, i) => sheet.mergeCells(dateHeaderRow.number, 2 + i * 2, dateHeaderRow.number, 3 + i * 2));
  sheet.mergeCells(dateHeaderRow.number, lastColumn - 1, dateHeaderRow.number, lastColumn);
  styleHeaderRow(dateHeaderRow, navy);

  const subHeaderRow = sheet.addRow(["Description", ...monthToDate.flatMap(() => ["USD", "PERSON"]), "USD", "PERSON"]);
  styleHeaderRow(subHeaderRow, lightBlue);

  const sheds = ["SHED A", "SHED B", "SHED C", "COMMON"];
  const dataStart = subHeaderRow.number + 1;
  sheds.forEach((shed, index) => {
    const values = monthToDate.flatMap((day) => { const t = actualTotalsForSheds(day.reports, [shed]); return [t.usd || "", t.persons || ""]; });
    const total = monthToDate.reduce((sum, day) => { const t = actualTotalsForSheds(day.reports, [shed]); return { usd: sum.usd + t.usd, persons: sum.persons + t.persons }; }, { usd: 0, persons: 0 });
    const row = sheet.addRow([`TOTAL OVERTIME ${shed.replace("SHED ", "SHED ")}`, ...values, total.usd || "", total.persons || ""]);
    row.eachCell((cell, column) => {
      cell.border = { top: border, left: border, bottom: border, right: border };
      cell.alignment = { horizontal: column === 1 ? "left" : "center", vertical: "middle" };
      if (column > 1) cell.numFmt = (column - 1) % 2 === 1 ? usdFormat : "#,##0";
    });
  });

  const totalRowNumber = dataStart + sheds.length;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.getCell(1).value = "Total";
  let grandTotalUsd = 0;
  for (let column = 2; column <= lastColumn; column++) {
    let sum = 0;
    for (let r = dataStart; r < totalRowNumber; r++) sum += Number(sheet.getCell(r, column).value ?? 0) || 0;
    const cell = totalRow.getCell(column);
    cell.value = sum;
    cell.numFmt = (column - 1) % 2 === 1 ? usdFormat : "#,##0";
    if (column === lastColumn - 1) grandTotalUsd = sum;
  }
  totalRow.eachCell((cell) => { cell.border = { top: border, left: border, bottom: border, right: border }; cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } }; });

  const footerRow = sheet.addRow(["Total All Overtime Cost TIL DATE", grandTotalUsd]);
  sheet.mergeCells(footerRow.number, 2, footerRow.number, lastColumn);
  footerRow.getCell(1).font = { bold: true };
  footerRow.getCell(2).numFmt = usdFormat;
  footerRow.getCell(2).alignment = { horizontal: "center" };
}

export async function buildOtPlanningWorkbook(date: string, reports: OtPlanningReport[], monthToDate: OtPlanningDaySnapshot[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MET OT Planning";

  buildMainSheet(workbook, date, reports);
  buildRecapSheet(workbook, date, reports);
  buildRecapPerDaySheet(workbook, monthToDate);
  buildRecapPerDepartmentSheet(workbook, monthToDate[monthToDate.length - 1]?.date ?? date, monthToDate);
  buildAccountingReportSheet(workbook, monthToDate);

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
