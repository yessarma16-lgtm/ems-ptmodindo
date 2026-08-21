import { NextRequest, NextResponse } from "next/server";

import { columnUpdateSchema } from "@/schemas/export-template.schema";
import { updateTemplateColumn, deleteTemplateColumn } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sheetId: string; columnId: string }> },
) {
  try {
    const { columnId } = await params;
    const body = await request.json();
    const parsed = columnUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const column = updateTemplateColumn(columnId, parsed.data);
    return NextResponse.json({ column });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sheetId: string; columnId: string }> },
) {
  try {
    const { columnId } = await params;
    deleteTemplateColumn(columnId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
