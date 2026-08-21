import { NextRequest, NextResponse } from "next/server";

import { duplicateTemplate } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const template = duplicateTemplate(id);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
