import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getTimeOverdueReport } from "@/lib/time-overdue-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("reportOverdueEmployee");
    const date = request.nextUrl.searchParams.get("dateFrom") ?? request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
    const report = await getTimeOverdueReport(date, dateTo);
    return NextResponse.json(report);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
