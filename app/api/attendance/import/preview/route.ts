import { NextRequest, NextResponse } from "next/server";

import { previewAttendanceImport } from "@/lib/attendance-import";
import { getOtReferences } from "@/lib/ot-planning-service";
import { toApiErrorResponse } from "@/lib/api-error";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Parsing + deteksi konflik SAJA — tidak menulis apa pun ke raw_attendance.
 * Dipanggil setelah user memilih file, sebelum tombol "Import" ditekan.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Tidak ada file yang diupload." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File terlalu besar (maks 20MB)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // OT Planning unit list, so Sheet2 estimate rows can be matched to a shed/division.
    // A failure here must not block the attendance preview — estimate import is optional.
    const otDivisions = await getOtReferences()
      .then((r) => (r.divisions ?? []).map((d: { shed: string; division: string }) => ({ shed: d.shed, division: d.division })))
      .catch(() => [] as { shed: string; division: string }[]);
    const preview = await previewAttendanceImport(buffer, file.name, undefined, otDivisions);
    return NextResponse.json({ preview });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
