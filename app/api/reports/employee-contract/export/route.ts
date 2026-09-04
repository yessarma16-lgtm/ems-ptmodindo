import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getEmployees } from "@/lib/employee-service";
import type { EmployeeRecord } from "@/lib/database/types";

const closeKeys = ["contractCloseFirst", "contractCloseSecond", "contractCloseThird", "contractCloseFourth", "contractCloseFiveth"];
const endingLabels: Record<string, string> = { thisMonth: "Contract Ending This Month", nextMonth: "Contract Ending Next Month", next2Months: "Contract Ending Next 2 Months" };
const value = (employee: EmployeeRecord, key: string) => String(employee[key] ?? "").trim();
const date = (employee: EmployeeRecord, key: string) => value(employee, key).slice(0, 10);
const range = (offset: number) => { const now = new Date(); const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)); const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0)); return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }; };
const inRange = (raw: string, from: string, to: string) => Boolean(raw) && (!from || raw >= from) && (!to || raw <= to);
const matches = (employee: EmployeeRecord, ending: string | undefined, from: string, to: string) => { if (value(employee, "status").toLowerCase() === "inactive") return false; const selected = ending === "thisMonth" ? range(0) : ending === "nextMonth" ? range(1) : ending === "next2Months" ? range(2) : { from, to }; return closeKeys.map((key) => date(employee, key)).some((raw) => inRange(raw, selected.from, selected.to)); };
const formatDate = (raw: string) => raw ? raw.split("-").reverse().join("/") : "";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? ""; const to = request.nextUrl.searchParams.get("to") ?? ""; const endings = request.nextUrl.searchParams.getAll("ending");
  const employees = await getEmployees(); const groups = endings.length ? endings : [""]; const rows = groups.flatMap((ending) => employees.filter((employee) => matches(employee, ending || undefined, from, to)).map((employee) => ({ employee, ending })));
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Employee Contract", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["No", "NIK (EMPLOYEE ID)", "NAME", "DEPARTMENT", "POTITION", "LEVEL", "SHED", "AGE", "JOIN DATE", "CONTRACT STATUS", "CONTRACT CLOSE-FIRST", "CONTRACT CLOSE-SECOND", "CONTRACT CLOSE-THIRD", "CONTRACT CLOSE-FOURTH", "CONTRACT CLOSE-FIVETH"];
  sheet.addRow(headers); sheet.getRow(1).font = { bold: true }; sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, header.length + 2) }));
  rows.forEach(({ employee }, index) => sheet.addRow([index + 1, value(employee, "nik"), value(employee, "name"), value(employee, "department"), value(employee, "position"), value(employee, "level"), value(employee, "shed"), value(employee, "age"), formatDate(date(employee, "joinDate")), value(employee, "contractStatus"), ...closeKeys.map((key) => formatDate(date(employee, key)))]));
  sheet.columns.forEach((_, index) => { sheet.getColumn(index + 1).numFmt = "@"; });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const label = endings.length === 1 ? endingLabels[endings[0]] : "Employee Contract";
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${label.replace(/\s+/g, "_")}.xlsx"`, "Content-Length": String(buffer.length) } });
}
