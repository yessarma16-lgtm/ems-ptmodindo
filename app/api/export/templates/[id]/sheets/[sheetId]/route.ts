import { NextRequest, NextResponse } from "next/server";

import { sheetInputSchema } from "@/schemas/export-template.schema";
import { updateTemplateSheet, deleteTemplateSheet } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sheetId: string }> },
) {
  try {
    const { sheetId } = await params;
    const body = await request.json();
    const parsed = sheetInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const sheet = updateTemplateSheet(sheetId, parsed.data.name);
    return NextResponse.json({ sheet });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sheetId: string }> },
) {
  try {
    const { sheetId } = await params;
    deleteTemplateSheet(sheetId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
