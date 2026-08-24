import { NextRequest, NextResponse } from "next/server";
import { generateNewHiringLinkSchema } from "@/schemas/new-hiring.schema";
import { generateNewHiringLink } from "@/lib/online-register-service";
import { requireModuleAccess } from "@/lib/module-permission";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("onlineRegister", "edit");
    const parsed = generateNewHiringLinkSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json(await generateNewHiringLink(parsed.data.applicant_id), { status: 201 });
  } catch (err) { return toApiErrorResponse(err); }
}
