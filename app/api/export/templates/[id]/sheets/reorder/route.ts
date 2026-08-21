import { NextRequest, NextResponse } from "next/server";

import { reorderSchema } from "@/schemas/export-template.schema";
import { reorderTemplateSheets } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Reorders the sheets within a template (drag & drop). Body: { orderedIds: string[] }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    reorderTemplateSheets(id, parsed.data.orderedIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
