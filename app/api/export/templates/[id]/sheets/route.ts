import { NextRequest, NextResponse } from "next/server";

import { sheetInputSchema } from "@/schemas/export-template.schema";
import { createTemplateSheet } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = sheetInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const sheet = createTemplateSheet(id, parsed.data.name);
    return NextResponse.json({ sheet }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
