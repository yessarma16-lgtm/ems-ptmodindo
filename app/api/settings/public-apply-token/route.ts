import { NextResponse } from "next/server";

import { getPublicApplyToken } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Authenticated (behind middleware) — returns the fixed token used to build the walk-in application QR code. */
export async function GET() {
  try {
    const token = await getPublicApplyToken();
    return NextResponse.json({ token });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
