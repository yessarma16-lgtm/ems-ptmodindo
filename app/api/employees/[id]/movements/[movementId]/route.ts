import { NextRequest, NextResponse } from "next/server";

import { employeeMovementInputSchema } from "@/schemas/employee-movement.schema";
import { updateMovementEntry, deleteMovementEntry } from "@/lib/employee-movement-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ movementId: string }> }) {
  try {
    const { movementId } = await params;
    const body = await request.json();
    const parsed = employeeMovementInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const entry = await updateMovementEntry(movementId, parsed.data);
    return NextResponse.json({ entry });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ movementId: string }> }) {
  try {
    const { movementId } = await params;
    await deleteMovementEntry(movementId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
