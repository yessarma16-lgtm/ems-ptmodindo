import { NextRequest, NextResponse } from "next/server";

import { importCommitSchema } from "@/schemas/attendance.schema";
import { commitAttendanceImport } from "@/lib/attendance-import";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { toApiErrorResponse } from "@/lib/api-error";

/** Dipanggil setelah user mengonfirmasi keputusan Timpa/Lewati per baris konflik (atau tidak ada konflik sama sekali). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = importCommitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const user = await getCurrentSessionUser();
    const summary = await commitAttendanceImport(
      parsed.data.rows,
      parsed.data.decisions,
      user?.name ?? "SYSTEM",
      parsed.data.sourceFilename,
    );
    return NextResponse.json({ summary });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
