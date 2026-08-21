import { NextRequest, NextResponse } from "next/server";

import { exportRequestSchema } from "@/schemas/export.schema";
import { generateExcel, ExportValidationError } from "@/lib/export-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = exportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { buffer, filename } = await generateExcel(parsed.data);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    if (err instanceof ExportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toApiErrorResponse(err);
  }
}
