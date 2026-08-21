import { NextRequest, NextResponse } from "next/server";

import { employeeSchema } from "@/schemas/employee.schema";
import { createOnlineRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const registration = await createOnlineRegistration(parsed.data);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
