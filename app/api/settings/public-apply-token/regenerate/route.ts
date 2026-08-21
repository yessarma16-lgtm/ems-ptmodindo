import { NextResponse } from "next/server";

import { regeneratePublicApplyToken } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Authenticated — rotates the walk-in application token. Any previously printed/shared QR code stops working immediately. */
export async function POST() {
  try {
    const token = await regeneratePublicApplyToken();
    return NextResponse.json({ token });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
