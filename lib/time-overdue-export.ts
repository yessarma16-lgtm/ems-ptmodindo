import "server-only";

import ExcelJS from "exceljs";
import type { TimeOverdueReport, TimeOverdueBucket } from "@/lib/time-overdue-service";
import { TIME_OVERDUE_BUCKETS } from "@/lib/time-overdue-service";

const navy = "FF1F4E78";
const lightBlue = "FFD9EAF7";
const border = { style: "thin" as const, color: { argb: "FF808080" } };

const SHED_ORDER = ["SHED A", "SHED B", "SHED C", "COMMON"];

/** Excel sheet names can't contain ":" "/" "\" "?" "*" "[" "]" — the bucket labels do, so each detail sheet gets a safe equivalent. */
const DETAIL_SHEET_NAMES: Record<TimeOverdueBucket, string> = {
  "0:00 - 0:15": "Name 0-15 Min",
  "0:16 - 0:20": "Name 16-20 Min",
  "> 0:21 Minute": "Name Over 21 Min",
};

const DETAIL_DESCRIPTIONS: Record<TimeOverdueBucket, string> = {
  "0:00 - 0:15": "0-15",
  "0:16 - 0:20": "16-20",
  "> 0:21 Minute": ">21",
};

function formatHHMM(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function groupByShed<T extends { shed: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const list = groups.get(row.shed) ?? []; list.push(row); groups.set(row.shed, list); }
  const order = [...SHED_ORDER, ...Array.from(groups.keys()).filter((s) => !SHED_ORDER.includes(s))];
  return order.filter((s) => groups.has(s)).map((s) => [s, groups.get(s)!]);
}

function styleHeaderRow(row: ExcelJS.Row, fill: string, bold = true) {
  row.eachCell((cell) => {
    cell.border = { top: border, left: border, bottom: border, right: border };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { bold, color: { argb: fill === navy ? "FFFFFFFF" : "FF000000" } };
  });
}

export function buildTimeOverdueWorkbook(date: string, report: TimeOverdueReport): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MET Report Time Overdue";

  const recap = workbook.addWorksheet("RECAPITULASI");
  recap.columns = [{ width: 6 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 12 }];
  const titleRow = recap.addRow([`REPORT TIME OVERDUE ${date}`]);
  recap.mergeCells(1, 1, 1, 6);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 24;
  for (const [shed, units] of groupByShed(report.units)) {
    const headerRow = recap.addRow(["NO", `DEPARTEMEN ${shed}`, "Time", "", "", "TOTAL"]);
    const subHeaderRow = recap.addRow(["", "", ...TIME_OVERDUE_BUCKETS, ""]);
    recap.mergeCells(headerRow.number, 1, subHeaderRow.number, 1);
    recap.mergeCells(headerRow.number, 2, subHeaderRow.number, 2);
    recap.mergeCells(headerRow.number, 3, headerRow.number, 5);
    recap.mergeCells(headerRow.number, 6, subHeaderRow.number, 6);
    styleHeaderRow(headerRow, navy);
    styleHeaderRow(subHeaderRow, lightBlue);

    units.forEach((unit, index) => {
      const values = [index + 1, unit.division, ...TIME_OVERDUE_BUCKETS.map((b) => unit.counts[b] || ""), unit.total];
      const dataRow = recap.addRow(values);
      dataRow.eachCell((cell, column) => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { horizontal: column <= 2 ? "left" : "center", vertical: "middle" };
      });
    });

    recap.addRow([]); // blank separator row between shed blocks
  }

  for (const bucket of TIME_OVERDUE_BUCKETS) {
    const sheet = workbook.addWorksheet(DETAIL_SHEET_NAMES[bucket]);
    sheet.columns = [
      { width: 6 }, { width: 16 }, { width: 26 }, { width: 26 }, { width: 10 }, { width: 20 },
      { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 12 },
    ];
    const headerRow = sheet.addRow(["NO", "NIK", "NAME", "DEPARTMENT", "SHED", "UNIT", "DATE", "INTIME", "OUTTIME", "IT1", "OT1", "OVERDUE (HH:MM)", "DESCRIPTION"]);
    styleHeaderRow(headerRow, navy);
    report.detail[bucket].forEach((item, index) => {
      const dataRow = sheet.addRow([
        index + 1, item.nik, item.name, item.department, item.shed, item.division, item.tanggal,
        item.intime, item.outtime, item.it1, item.ot1, formatHHMM(item.selisihMinutes), DETAIL_DESCRIPTIONS[bucket],
      ]);
      dataRow.eachCell((cell, column) => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { horizontal: column <= 4 ? "left" : "center", vertical: "middle" };
      });
    });
  }

  return workbook;
}
