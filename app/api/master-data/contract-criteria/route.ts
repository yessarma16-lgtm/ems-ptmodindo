import { NextRequest, NextResponse } from "next/server";

import { contractCriteriaInputSchema } from "@/schemas/contract-criteria.schema";
import { getContractCriteria, createContractCriteriaItem } from "@/lib/contract-criteria-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** All Contract Criteria entries (active + inactive) — Settings > Master Data admin UI. */
export async function GET() {
  try {
    const items = await getContractCriteria({ activeOnly: false });
    return NextResponse.json({ items });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contractCriteriaInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const item = await createContractCriteriaItem(parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
