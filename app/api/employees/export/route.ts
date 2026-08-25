import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { getEmployeeListPage } from "@/lib/employee-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { formatDateDMY } from "@/lib/date-format";
import type { EmployeeListQuery, EmployeeListScope, EmployeeSortKey } from "@/lib/database/types";

/** No pagination UI here — one page covers every matching row. */
const EXPORT_PAGE_SIZE = 100_000;
const SCOPES: EmployeeListScope[] = ["active", "inactive", "expatriate"];
const SORT_KEYS: EmployeeSortKey[] = ["name", "department", "joinDate", "exitDate"];

const SHEET_TITLES: Record<EmployeeListScope, string> = {
  active: "Active Employees",
  inactive: "Inactive Employees",
  expatriate: "Expatriate Employees",
};

/** Same ?scope=/q=/dept=/... shape EmployeeTable writes to the URL — see buildEmployeeExportQueryString. */
function parseQuery(searchParams: URLSearchParams): EmployeeListQuery {
  const scopeRaw = searchParams.get("scope") ?? "active";
  const scope = (SCOPES as string[]).includes(scopeRaw) ? (scopeRaw as EmployeeListScope) : "active";
  const sortKeyRaw = searchParams.get("sort") ?? "name";
  const sortKey = (SORT_KEYS as string[]).includes(sortKeyRaw) ? (sortKeyRaw as EmployeeSortKey) : "name";

  return {
    scope,
    search: searchParams.get("q") ?? "",
    department: searchParams.get("dept") ?? "",
    status: searchParams.get("status") ?? "",
    contractStatus: searchParams.get("contract") ?? "",
    dateFrom: searchParams.get("from") ?? "",
    dateTo: searchParams.get("to") ?? "",
    sortKey,
    sortAsc: searchParams.get("dir") !== "desc",
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  };
}

/** Exports whatever the Employee list currently shows (same filters/sort, same columns as EmployeeTable) to .xlsx — no template configuration required. */
export async function GET(request: NextRequest) {
  try {
    const query = parseQuery(request.nextUrl.searchParams);
    const { items } = await getEmployeeListPage(query);
    const isInactive = query.scope === "inactive";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Employee Management System";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(SHEET_TITLES[query.scope], { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "SN", key: "sn", width: 6 },
      { header: "NIK / Employee ID", key: "nik", width: 20 },
      { header: "Name", key: "name", width: 28 },
      { header: "Department", key: "department", width: 22 },
      { header: "Position", key: "position", width: 22 },
      { header: "Level", key: "level", width: 14 },
      { header: isInactive ? "Join Date" : "Type", key: "typeOrJoinDate", width: 16 },
      { header: isInactive ? "Resign Date" : "Join Date", key: "dateColumn", width: 16 },
      { header: "Contract Status", key: "contractStatus", width: 18 },
      { header: "Status", key: "status", width: 14 },
      { header: "Interview Evaluation", key: "interviewEvaluation", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((_, idx) => {
      sheet.getColumn(idx + 1).numFmt = "@"; // text — protects NIK-like values from losing leading zeros
    });

    items.forEach((employee, idx) => {
      sheet.addRow({
        sn: idx + 1,
        nik: employee.nik,
        name: employee.name,
        department: employee.department,
        position: employee.position,
        level: employee.level,
        typeOrJoinDate: isInactive ? formatDateDMY(employee.joinDate) : employee.type,
        dateColumn: isInactive ? formatDateDMY(employee.exitDate) : formatDateDMY(employee.joinDate),
        contractStatus: employee.contractStatus,
        status: employee.status,
        interviewEvaluation: employee.interviewEvaluation,
      });
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${SHEET_TITLES[query.scope].replace(/\s+/g, "_")}_${timestamp}.xlsx`;

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
