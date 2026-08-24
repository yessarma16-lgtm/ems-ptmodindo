import { NextRequest, NextResponse } from "next/server";
import { publicApplySchema } from "@/schemas/employee.schema";
import { createNewHiringQrApplication } from "@/lib/online-register-service";
import { getNewHiringApplyToken } from "@/lib/settings-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Public, unauthenticated — the New Hiring QR code / link posts here.
 * `token` must match the current settings.new_hiring_apply_token; if HR has
 * regenerated it (invalidating old printed codes), this rejects with 404
 * rather than silently accepting the stale submission.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (token !== (await getNewHiringApplyToken())) {
      return NextResponse.json({ error: "This application link is no longer valid." }, { status: 404 });
    }
    const parsed = publicApplySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json({ registration: await createNewHiringQrApplication(parsed.data) }, { status: 201 });
  } catch (error) { return toApiErrorResponse(error); }
}
