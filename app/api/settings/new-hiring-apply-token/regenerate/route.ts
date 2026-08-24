import { NextResponse } from "next/server";

import { regenerateNewHiringApplyToken } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Authenticated — rotates the New Hiring application token. Any previously printed/shared QR code stops working immediately. */
export async function POST() {
  try {
    const token = await regenerateNewHiringApplyToken();
    return NextResponse.json({ token });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
