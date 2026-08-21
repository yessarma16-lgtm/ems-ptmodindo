import { NextResponse } from "next/server";

import { approveOnlineRegistration } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    const { recordId } = await params;
    const result = await approveOnlineRegistration(recordId);
    return NextResponse.json(result);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
