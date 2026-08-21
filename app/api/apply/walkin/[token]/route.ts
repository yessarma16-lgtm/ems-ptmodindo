import { NextRequest, NextResponse } from "next/server";

import { publicApplySchema } from "@/schemas/employee.schema";
import { createWalkInApplication } from "@/lib/online-register-service";
import { getPublicApplyToken } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Public, unauthenticated — the fixed walk-in QR code / link posts here.
 * `token` must match the current settings.public_apply_token; if HR has
 * regenerated it (invalidating old printed codes), this rejects with 404
 * rather than silently accepting the stale submission.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (token !== (await getPublicApplyToken())) {
      return NextResponse.json({ error: "This application link is no longer valid." }, { status: 404 });
    }

    const body = await request.json();
    const parsed = publicApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const registration = await createWalkInApplication(parsed.data);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
