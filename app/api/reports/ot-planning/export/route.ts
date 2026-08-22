import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getOtPlanning } from "@/lib/ot-planning-service";
import { buildOtPlanningWorkbook } from "@/lib/ot-planning-export";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const sheds = request.nextUrl.searchParams.getAll("shed");
    const reports = await getOtPlanning(date, sheds.length ? sheds : undefined);
    const workbook = await buildOtPlanningWorkbook(date, reports);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="ot-planning-${date}.xlsx"` } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
