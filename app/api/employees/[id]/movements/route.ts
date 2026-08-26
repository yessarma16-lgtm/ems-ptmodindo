import { NextRequest, NextResponse } from "next/server";

import { employeeMovementInputSchema } from "@/schemas/employee-movement.schema";
import { getMovementHistory, createMovementEntry } from "@/lib/employee-movement-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entries = await getMovementHistory(id);
    return NextResponse.json({ entries });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = employeeMovementInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const entry = await createMovementEntry(id, parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
