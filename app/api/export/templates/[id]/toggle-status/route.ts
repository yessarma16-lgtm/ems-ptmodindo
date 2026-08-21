import { NextRequest, NextResponse } from "next/server";

import { toggleTemplateStatus } from "@/lib/export-template-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const template = toggleTemplateStatus(id);
    return NextResponse.json({ template });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
