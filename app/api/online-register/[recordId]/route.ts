import { NextRequest, NextResponse } from "next/server";

import { employeeSchema } from "@/schemas/employee.schema";
import { updateOnlineRegistration, deleteOnlineRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    const { recordId } = await params;
    const body = await request.json();
    // HR Review save (EmployeeForm's "HR Review" button, /recruitment/[id]
    // only) — saves whatever HR has filled in so far without enforcing
    // mandatory fields. Approve/Promote independently re-checks the required
    // set (see REQUIRED_FOR_APPROVAL in postgres-online-registrations.ts)
    // before a registration can advance, so nothing incomplete slips through
    // into a real Employee record via this bypass.
    const isHrReview = request.headers.get("x-hr-review") === "1";
    const parsed = (isHrReview ? employeeSchema.partial() : employeeSchema).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    // .partial() types every field as possibly-undefined, but the client
    // always sends every field key (blank string for untouched ones) — this
    // just satisfies updateOnlineRegistration's Record<string, string> shape.
    const data: Record<string, string> = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [key, value ?? ""]),
    );
    const registration = await updateOnlineRegistration(recordId, data);
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
