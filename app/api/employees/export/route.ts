import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { getEmployees } from "@/lib/employee-service";
import { ALL_EMPLOYEE_FORM_FIELDS } from "@/config/employee-fields";
import { toApiErrorResponse } from "@/lib/api-error";
import { formatDateDMY } from "@/lib/date-format";
import { parseEmployeeListSearchParams, matchesEmployeeListQuery } from "@/lib/employee-list-data";
import type { EmployeeRecord, EmployeeListScope } from "@/lib/database/types";

const SCOPES: EmployeeListScope[] = ["active", "inactive", "expatriate"];

const SHEET_TITLES: Record<EmployeeListScope, string> = {
  active: "Active Employees",
  inactive: "Inactive Employees",
  expatriate: "Expatriate Employees",
};

/** Same STATUS/CATEGORY rules the Active/Inactive/Expatriate list pages filter by. */
function matchesScope(employee: EmployeeRecord, scope: EmployeeListScope): boolean {
  const status = (employee.status ?? "").trim().toLowerCase();
  if (scope === "inactive") return status === "inactive";
  if (scope === "expatriate") return (employee.category ?? "").trim().toLowerCase() === "expatriate";
  return status !== "inactive";
}

/**
 * Dumps every employee matching the chosen scope AND the current list page's
 * search/department/status/position/contract/date-range filters (same query
 * params EmployeeTable's URL carries) — the FULL record (all ~60 Employee
 * Form fields), not just the handful of columns the on-screen table shows.
 * Reads via getEmployees(), which already paginates past Supabase
 * PostgREST's hard 1000-row-per-request cap (see fetchAllRowsParallel in
 * postgres-adapter.ts) — a single large .range() request silently truncates
 * at 1000, which is why an earlier version of this route under-exported.
 */
export async function GET(request: NextRequest) {
  try {
    const scopeRaw = request.nextUrl.searchParams.get("scope") ?? "active";
    const scope = (SCOPES as string[]).includes(scopeRaw) ? (scopeRaw as EmployeeListScope) : "active";

    const searchParams: Record<string, string | string[] | undefined> = {};
    for (const key of request.nextUrl.searchParams.keys()) {
      const values = request.nextUrl.searchParams.getAll(key);
      searchParams[key] = values.length > 1 ? values : values[0];
    }
    const query = parseEmployeeListSearchParams(searchParams, scope);

    const allEmployees = await getEmployees();
    const employees = allEmployees.filter((e) => matchesScope(e, scope) && matchesEmployeeListQuery(e, query));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Employee Management System";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(SHEET_TITLES[scope], { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = ALL_EMPLOYEE_FORM_FIELDS.map((field) => ({
      header: field.label,
      key: field.key,
      width: Math.max(14, field.label.length + 2),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((_, idx) => {
      sheet.getColumn(idx + 1).numFmt = "@"; // text — protects NIK-like values from losing leading zeros
    });

    employees.forEach((employee) => {
      const row: Record<string, string> = {};
      for (const field of ALL_EMPLOYEE_FORM_FIELDS) {
        const raw = employee[field.key] ?? "";
        row[field.key] = field.type === "date" ? formatDateDMY(raw) : raw;
      }
      sheet.addRow(row);
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${SHEET_TITLES[scope].replace(/\s+/g, "_")}_${timestamp}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
