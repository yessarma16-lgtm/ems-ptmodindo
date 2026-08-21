import { NextRequest, NextResponse } from "next/server";

import { contractHistoryInputSchema } from "@/schemas/contract-history.schema";
import { updateContractHistoryEntry, deleteContractHistoryEntry } from "@/lib/employee-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  try {
    const { contractId } = await params;
    const body = await request.json();
    const parsed = contractHistoryInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const entry = await updateContractHistoryEntry(contractId, parsed.data);
    return NextResponse.json({ entry });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  try {
    const { contractId } = await params;
    await deleteContractHistoryEntry(contractId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
