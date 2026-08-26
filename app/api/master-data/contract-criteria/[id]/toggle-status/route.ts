import { NextRequest, NextResponse } from "next/server";

import { toggleContractCriteriaStatus } from "@/lib/contract-criteria-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Flips a Contract Criteria entry between Active/Inactive. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const item = await toggleContractCriteriaStatus(id);
    return NextResponse.json({ item });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
