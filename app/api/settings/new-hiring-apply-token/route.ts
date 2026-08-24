import { NextResponse } from "next/server";

import { getNewHiringApplyToken } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Authenticated (behind middleware) — returns the token used to build the New Hiring application QR code. */
export async function GET() {
  try {
    const token = await getNewHiringApplyToken();
    return NextResponse.json({ token });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
