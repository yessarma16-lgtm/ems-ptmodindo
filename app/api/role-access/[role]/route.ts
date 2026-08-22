import { NextRequest, NextResponse } from "next/server";

import { roleAccessUpdateSchema } from "@/schemas/role-access.schema";
import { updateRoleAccess } from "@/lib/role-access-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { isDeveloperUser } from "@/lib/auth/developer-access";
import { ModulePermissionError } from "@/lib/module-permission";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  try {
    if (!isDeveloperUser(await getCurrentSessionUser())) throw new ModulePermissionError("userManagement");
    const { role } = await params;
    const body = await request.json();
    const parsed = roleAccessUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const updated = await updateRoleAccess(decodeURIComponent(role), parsed.data.permissions);
    return NextResponse.json({ role: updated });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
