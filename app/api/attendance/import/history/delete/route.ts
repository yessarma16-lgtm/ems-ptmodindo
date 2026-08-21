import { NextRequest, NextResponse } from "next/server";
import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { sourceFilename?: string; importedAt?: string };
    if (!body.sourceFilename || !body.importedAt) return NextResponse.json({ error: "File dan waktu import wajib diisi." }, { status: 400 });
    await getAttendanceAdapter().deleteImport(body.sourceFilename, body.importedAt);
    return NextResponse.json({ ok: true });
  } catch (err) { return toApiErrorResponse(err); }
}
