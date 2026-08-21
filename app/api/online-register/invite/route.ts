import { NextRequest, NextResponse } from "next/server";

import { registrationInviteSchema } from "@/schemas/registration-invite.schema";
import { createInviteRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** HR-only: generates a shareable /apply/[token] link from Name/HP Number/Position. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registrationInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const registration = await createInviteRegistration(parsed.data);
    return NextResponse.json({ registration, token: registration.recordId }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
