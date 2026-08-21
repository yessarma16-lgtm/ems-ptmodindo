import { NextRequest, NextResponse } from "next/server";

import { publicApplySchema } from "@/schemas/employee.schema";
import { submitPublicApplication } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Public, unauthenticated — a candidate submits their application via the
 * link HR generated. `token` is the registration's record_id. Name/HP
 * Number/Position are force-preserved server-side in submitPublicApplication
 * regardless of what the body contains, so this route doesn't need to
 * special-case them.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = publicApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const registration = await submitPublicApplication(token, parsed.data);
    return NextResponse.json({ registration });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
