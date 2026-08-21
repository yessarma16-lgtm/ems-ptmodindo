import { NextRequest, NextResponse } from "next/server";

import { contractHistoryInputSchema } from "@/schemas/contract-history.schema";
import { getContractHistory, createContractHistoryEntry } from "@/lib/employee-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entries = await getContractHistory(id);
    return NextResponse.json({ entries });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = contractHistoryInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const entry = await createContractHistoryEntry(id, parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
