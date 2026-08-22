import { NextRequest } from "next/server";

import { getAttendanceAdapter } from "@/lib/database/attendance-adapter";
import { toApiErrorResponse } from "@/lib/api-error";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom : undefined;
    const dateTo = typeof body.dateTo === "string" ? body.dateTo : undefined;
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(Math.floor(body.limit), 100_000) : undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          const user = await getCurrentSessionUser().catch(() => null);
          const summary = await getAttendanceAdapter().runCrosscheck(undefined, { dateFrom, dateTo, limit }, (processed, total) => send({ type: "progress", processed, total }), () => request.signal.aborted);
          await logActivity(user?.name, "Kalkulasi attendance");
          send({ type: "done", summary });
        } catch (err) {
          if (!request.signal.aborted) send({ type: "error", message: err instanceof Error ? err.message : "Failed to run crosscheck." });
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
