import { NextResponse } from "next/server";

import { rejectOnlineRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";

export async function POST(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    await requireModuleAccess("onlineRegister", "edit");
    const { recordId } = await params;
    const registration = await rejectOnlineRegistration(recordId);
    return NextResponse.json({ registration });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
