import { NextResponse } from "next/server";

import { getUsers, getAllUserPermissionsOverrides } from "@/lib/user-service";
import { getAllRoleAccess } from "@/lib/role-access-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { isDeveloperUser } from "@/lib/auth/developer-access";
import { ModulePermissionError } from "@/lib/module-permission";

/** Everything the Individual Access manager needs: users (with their current override), plus the role baselines. */
export async function GET() {
  try {
    if (!isDeveloperUser(await getCurrentSessionUser())) throw new ModulePermissionError("userManagement");

    const [users, roles, overrides] = await Promise.all([
      getUsers(),
      getAllRoleAccess(),
      getAllUserPermissionsOverrides(),
    ]);
    const overrideById = new Map(overrides.map((o) => [o.id, o.override]));

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        status: u.status,
        override: overrideById.get(u.id) ?? {},
      })),
      roles,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
