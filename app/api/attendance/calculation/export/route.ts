import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { attendanceCalculationFilterSchema } from "@/schemas/attendance.schema";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const parsed = attendanceCalculationFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "Invalid calculation filter." }, { status: 400 });
    const rows = await getAttendanceAdapter().getCalculatedAttendance(parsed.data);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("MPP Attendance Calculation");
    const columns = [
      ["Date", "tanggal"], ["NIK", "nik"], ["Name", "nama"], ["Department", "department"],
      ["InTime", "intime"], ["OutTime", "outtime"], ["IT1", "it1"], ["OT1", "ot1"], ["WHour", "whour"], ["Description", "kategori"],
      ["Day Type", "dayType"], ["Bracket Used", "bracketUsed"], ["Recorded OTH", "recordedOth"], ["System OTH", "systemCalculatedOth"], ["NK OTH", "finalOth"], ["Status", "status"], ["Calculated At", "calculatedAt"], ["Correction Note", "correctionNote"], ["Corrected By", "correctedBy"],
    ] as const;
    sheet.columns = columns.map(([header, key]) => ({ header, key }));
    const rawRows = await getAttendanceAdapter().getRawAttendance({});
    const rawByKey = new Map(rawRows.map((row) => [`${row.nik}::${row.tanggal}`, row]));
    for (const row of rows) {
      const raw = rawByKey.get(`${row.nik}::${row.tanggal}`);
      sheet.addRow({ ...row, recordedOth: raw?.othourRecorded ?? null });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename*=UTF-8''mpp-attendance-calculation.xlsx" } });
  } catch (err) { return toApiErrorResponse(err); }
}
