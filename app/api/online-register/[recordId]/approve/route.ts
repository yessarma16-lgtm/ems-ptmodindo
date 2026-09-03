import { NextResponse } from "next/server";

import { approveOnlineRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";

export async function POST(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    const approver = await requireModuleAccess("recruitmentApplicantPool", "edit");
    const { recordId } = await params;
    const result = await approveOnlineRegistration(recordId, approver.name);
    return NextResponse.json(result);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
