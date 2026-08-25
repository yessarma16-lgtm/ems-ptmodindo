import { NextRequest, NextResponse } from "next/server";

import { employeeSyncCommitSchema } from "@/schemas/employee-sync.schema";
import { commitEmployeeSync } from "@/lib/employee-sync";
import { toApiErrorResponse } from "@/lib/api-error";

/** Applies the admin's per-row apply/skip decisions from the sync preview. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = employeeSyncCommitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          const summary = await commitEmployeeSync(
            { newRows: parsed.data.newRows, changedRows: parsed.data.changedRows, inactivatedRows: parsed.data.inactivatedRows },
            parsed.data.decisions,
            (processed, total) => send({ type: "progress", processed, total }),
          );
          send({ type: "done", summary });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to sync employee data.";
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
