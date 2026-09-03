import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getTimeOverdueReport } from "@/lib/time-overdue-service";
import { buildTimeOverdueWorkbook } from "@/lib/time-overdue-export";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("reportEmployee");
    const date = request.nextUrl.searchParams.get("dateFrom") ?? request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
    const report = await getTimeOverdueReport(date, dateTo);
    const periodLabel = dateTo ? `${date} to ${dateTo}` : date;
    const workbook = buildTimeOverdueWorkbook(periodLabel, report);
    const buffer = await workbook.xlsx.writeBuffer();
    const filenamePeriod = dateTo ? `${date}_to_${dateTo}` : date;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-time-overdue-${filenamePeriod}.xlsx"`,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
