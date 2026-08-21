import { NextRequest, NextResponse } from "next/server";

import { columnInputSchema } from "@/schemas/export-template.schema";
import { createTemplateColumn } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sheetId: string }> },
) {
  try {
    const { sheetId } = await params;
    const body = await request.json();
    const parsed = columnInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const column = createTemplateColumn(sheetId, parsed.data);
    return NextResponse.json({ column }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
