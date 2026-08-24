import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { getOtPlanning } from "@/lib/ot-planning-service";
import { buildOtPlanningPdf } from "@/lib/ot-planning-export";
import { toApiErrorResponse } from "@/lib/api-error";

// PDFKit requires Node's stream/buffer APIs and cannot run in an Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireModuleAccess("attendanceReport");
    const date = request.nextUrl.searchParams.get("dateFrom") ?? request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
    const sheds = request.nextUrl.searchParams.getAll("shed");
    const reports = await getOtPlanning(date, sheds.length ? sheds : undefined, dateTo);
    const buffer = await buildOtPlanningPdf(dateTo ? `${date} to ${dateTo}` : date, reports);
    if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("PDF generator returned an invalid document");
    }
    const filterLabel = (sheds.length ? sheds : ["ALL-DEPARTMENTS"]).join("-").replace(/[^a-zA-Z0-9-]+/g, "-");
    const periodLabel = dateTo ? `${date}_to_${dateTo}` : date;
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="ot-planning-${filterLabel}-${periodLabel}.pdf"` } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
