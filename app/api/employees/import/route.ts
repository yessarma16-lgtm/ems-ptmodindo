import { NextRequest } from "next/server";

import { importEmployeesFromWorkbook, ImportParseError } from "@/lib/employee-import";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// Safety margin on top of the chunked bulk-insert fix (lib/employee-import.ts)
// — a very large file should finish in seconds/tens-of-seconds now, but this
// gives real headroom instead of relying on Vercel's short default.
export const maxDuration = 300;

/**
 * Streams newline-delimited JSON progress events while importing, so the
 * dialog can show a live "X of Y done" count instead of one big spinner —
 * a single import can take a while since each row is its own Sheets API
 * write. One line per event: {"type":"progress",...} while running, then
 * exactly one {"type":"done","result":...} or {"type":"error","message":...}
 * to close out the stream. Status stays 200 throughout since the response
 * has already started streaming by the time an error can occur.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File is too large (max 10MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const result = await importEmployeesFromWorkbook(buffer, (progress) => send({ type: "progress", ...progress }));
        send({ type: "done", result });
      } catch (err) {
        const message =
          err instanceof ImportParseError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to import file.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
