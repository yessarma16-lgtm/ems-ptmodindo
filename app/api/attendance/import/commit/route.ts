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
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          const summary = await commitAttendanceImport(
            parsed.data.rows,
            parsed.data.decisions,
            user?.name ?? "SYSTEM",
            parsed.data.sourceFilename,
            undefined,
            (processed, total) => send({ type: "progress", processed, total }),
            parsed.data.estimateRows,
          );
          send({ type: "done", summary });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to save imported data.";
          send({ type: "error", message });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
