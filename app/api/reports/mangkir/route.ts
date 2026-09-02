import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getMangkirReport } from "@/lib/mangkir-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const dateFrom = request.nextUrl.searchParams.get("dateFrom");
    const dateTo = request.nextUrl.searchParams.get("dateTo");
    if (!dateFrom || !dateTo) return NextResponse.json({ error: "dateFrom and dateTo are required." }, { status: 400 });
    const report = await getMangkirReport(dateFrom, dateTo);
    return NextResponse.json(report);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
