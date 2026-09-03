import { NextRequest, NextResponse } from "next/server";

import { registrationInviteSchema } from "@/schemas/registration-invite.schema";
import { createInviteRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";

/** HR-only: generates a shareable /apply/[token] link from Name/HP Number/Position. */
export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("recruitmentApplicantPool", "edit");
    const body = await request.json();
    const parsed = registrationInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const registration = await createInviteRegistration(parsed.data);
    const token = registration.recordId?.trim();
    if (!token) {
      return NextResponse.json({ error: "Registrasi berhasil dibuat, tetapi token link tidak tersedia." }, { status: 500 });
    }
    return NextResponse.json({ registration, token }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
