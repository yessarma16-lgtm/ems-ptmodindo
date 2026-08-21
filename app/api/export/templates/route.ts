import { NextRequest, NextResponse } from "next/server";

import { templateInputSchema } from "@/schemas/export-template.schema";
import { getTemplates, createTemplate } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const templates = getTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = templateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const template = createTemplate(parsed.data);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
