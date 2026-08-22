import { NextRequest, NextResponse } from "next/server";

import { generateAttendanceReport } from "@/lib/attendance-report-service";
import { requireModuleAccess } from "@/lib/module-permission";
import { attendanceCalculationFilterSchema } from "@/schemas/attendance.schema";
import { toApiErrorResponse } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: NextRequest) {
  try {
    const user = await requireModuleAccess("attendanceReport");
    const body = await request.json();
    const kind = body.kind;
    if (kind !== "employee" && kind !== "department" && kind !== "exceptions") return NextResponse.json({ error: "Jenis report tidak valid." }, { status: 400 });
    const filters = attendanceCalculationFilterSchema.parse(body.filters ?? {});
    const result = await generateAttendanceReport(kind, filters, user.name);
    await logActivity(user.name, "Narik report");
    return new NextResponse(result.buffer as BodyInit, { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${result.filename}"`, "Content-Length": String(result.buffer.length) } });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
