import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getOtPlanning, getOtReferences } from "@/lib/ot-planning-service";
import { buildOtPlanningWorkbook, summarizeOtPlanningReports } from "@/lib/ot-planning-export";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const date = request.nextUrl.searchParams.get("dateFrom") ?? request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
    const sheds = request.nextUrl.searchParams.getAll("shed");
    const reports = await getOtPlanning(date, sheds.length ? sheds : undefined, dateTo);
    const allDepartments = request.nextUrl.searchParams.get("summary") === "1";
    const exportReports = allDepartments ? summarizeOtPlanningReports(reports) : reports;
    const workbook = await buildOtPlanningWorkbook(dateTo ? `${date} to ${dateTo}` : date, exportReports, await getOtReferences());
    const buffer = await workbook.xlsx.writeBuffer();
    const filterLabel = (sheds.length ? sheds : ["ALL-DEPARTMENTS"]).join("-").replace(/[^a-zA-Z0-9-]+/g, "-");
    const periodLabel = dateTo ? `${date}_to_${dateTo}` : date;
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="ot-planning-${filterLabel}-${periodLabel}.xlsx"` } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
