import { NextRequest, NextResponse } from "next/server";

import { previewAttendanceImport } from "@/lib/attendance-import";
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
    const preview = await previewAttendanceImport(buffer, file.name);
    return NextResponse.json({ preview });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
