import { NextResponse } from "next/server";

import { promoteRegistrationToNewHiring } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";

/** Advances an Applicant Pool candidate to the New Hiring (document review) stage — see promoteRegistrationToNewHiring for the pipeline rationale. */
export async function POST(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    await requireModuleAccess("recruitmentApplicantPool", "edit");
    const { recordId } = await params;
    await promoteRegistrationToNewHiring(recordId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
