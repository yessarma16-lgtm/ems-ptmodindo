import { NextResponse } from "next/server";

import { getAllRoleAccess } from "@/lib/role-access-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { isDeveloperUser } from "@/lib/auth/developer-access";
import { ModulePermissionError } from "@/lib/module-permission";

export async function GET() {
  try {
    if (!isDeveloperUser(await getCurrentSessionUser())) throw new ModulePermissionError("userManagement");
    const roles = await getAllRoleAccess();
    return NextResponse.json({ roles });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
