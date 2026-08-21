import { NextRequest, NextResponse } from "next/server";

import { templateUpdateSchema } from "@/schemas/export-template.schema";
import { getTemplateById, updateTemplate, ExportTemplateNotFoundError } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const template = getTemplateById(id);
    if (!template) {
      return NextResponse.json({ error: "Export template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = templateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (!getTemplateById(id)) throw new ExportTemplateNotFoundError(id);
    const template = updateTemplate(id, parsed.data);
    return NextResponse.json({ template });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
