import { NextRequest, NextResponse } from "next/server";

import { contractCriteriaInputSchema } from "@/schemas/contract-criteria.schema";
import { updateContractCriteriaItem } from "@/lib/contract-criteria-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = contractCriteriaInputSchema.partial({ code: true, name: true, periods: true }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const item = await updateContractCriteriaItem(id, parsed.data);
    return NextResponse.json({ item });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
