import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const sourceFilename = request.nextUrl.searchParams.get("sourceFilename");
    const importedAt = request.nextUrl.searchParams.get("importedAt");
    if (!sourceFilename || !importedAt) return NextResponse.json({ error: "File dan waktu import wajib diisi." }, { status: 400 });
    const rows = (await getAttendanceAdapter().getRawAttendance({})).filter((row) => row.sourceFilename === sourceFilename && row.importedAt === importedAt);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data Cross Check NK");
    sheet.columns = ["NIK", "Nama", "Department", "Date", "InTime", "OutTime", "IT1", "OT1", "WHour", "BHour", "OTHour", "Description"].map((header) => ({ header, key: header }));
    for (const row of rows) sheet.addRow({ NIK: row.nik, Nama: row.nama, Department: row.department, Date: row.tanggal, InTime: row.intime, OutTime: row.outtime, IT1: row.it1, OT1: row.ot1, WHour: row.whour, BHour: row.bhour, OTHour: row.othourRecorded, Description: row.kategori });
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = sourceFilename.endsWith(".xlsx") ? sourceFilename : `${sourceFilename}.xlsx`;
    return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } });
  } catch (err) { return toApiErrorResponse(err); }
}
