import { NextRequest, NextResponse } from "next/server";

import { employeeSchema } from "@/schemas/employee.schema";
import { updateOnlineRegistration, deleteOnlineRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    const { recordId } = await params;
    const body = await request.json();
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const registration = await updateOnlineRegistration(recordId, parsed.data);
    return NextResponse.json({ registration });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    const { recordId } = await params;
    await deleteOnlineRegistration(recordId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
