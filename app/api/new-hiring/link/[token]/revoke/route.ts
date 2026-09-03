import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/module-permission";
import { revokeNewHiringLink } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await requireModuleAccess("recruitmentNewHiring", "edit");
    await revokeNewHiringLink((await params).token);
    return NextResponse.json({ ok: true });
  } catch (error) { return toApiErrorResponse(error); }
}
