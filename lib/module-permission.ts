import "server-only";

import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { getAllRoleAccess } from "@/lib/role-access-service";
import type { ModuleKey, AccessLevel } from "@/config/module-permissions";

export class ModuleAuthenticationError extends Error {
  constructor() { super("Authentication required."); this.name = "ModuleAuthenticationError"; }
}

export class ModulePermissionError extends Error {
  constructor(moduleKey: ModuleKey) { super(`Access denied for module ${moduleKey}.`); this.name = "ModulePermissionError"; }
}

export function hasModuleAccess(access: AccessLevel | undefined, minimum: AccessLevel = "view"): boolean {
  return access !== "hidden" && access !== undefined && (minimum !== "edit" || access === "edit");
}

export async function requireModuleAccess(moduleKey: ModuleKey, minimum: AccessLevel = "view") {
  const user = await getCurrentSessionUser();
  if (!user) throw new ModuleAuthenticationError();
  const role = (await getAllRoleAccess()).find((item) => item.role === user.role);
  const access = role?.permissions[moduleKey] ?? "hidden";
  if (!hasModuleAccess(access, minimum)) throw new ModulePermissionError(moduleKey);
  return user;
}
