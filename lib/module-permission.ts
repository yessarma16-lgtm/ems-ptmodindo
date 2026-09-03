import "server-only";

import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { getAllRoleAccess } from "@/lib/role-access-service";
import { getUserPermissionsOverride } from "@/lib/user-service";
import { FULL_ACCESS_ROLE } from "@/config/user-roles";
import {
  allHiddenModulePermissions,
  defaultModulePermissions,
  normalizeModulePermissions,
  type ModuleKey,
  type AccessLevel,
  type ModulePermissions,
} from "@/config/module-permissions";
import type { User } from "@/lib/user-service";

export class ModuleAuthenticationError extends Error {
  constructor() { super("Authentication required."); this.name = "ModuleAuthenticationError"; }
}

export class ModulePermissionError extends Error {
  constructor(moduleKey: ModuleKey) { super(`Access denied for module ${moduleKey}.`); this.name = "ModulePermissionError"; }
}

export function hasModuleAccess(access: AccessLevel | undefined, minimum: AccessLevel = "view"): boolean {
  return access !== "hidden" && access !== undefined && (minimum !== "edit" || access === "edit");
}

/**
 * A user's effective per-module access: their ROLE's permissions with any
 * per-user Individual Access override layered on top (override wins,
 * module-by-module; a module absent from the override inherits the role).
 * FULL_ACCESS_ROLE (Administrator) is always full "edit" — never lowered by a
 * role setting or an individual override.
 */
export async function getEffectivePermissions(user: Pick<User, "id" | "role">): Promise<ModulePermissions> {
  if (user.role === FULL_ACCESS_ROLE) return defaultModulePermissions();
  const roles = await getAllRoleAccess();
  const rolePerms = roles.find((r) => r.role === user.role)?.permissions ?? allHiddenModulePermissions();
  const override = await getUserPermissionsOverride(user.id);
  return normalizeModulePermissions({ ...rolePerms, ...override });
}

export async function requireModuleAccess(moduleKey: ModuleKey, minimum: AccessLevel = "view") {
  const user = await getCurrentSessionUser();
  if (!user) throw new ModuleAuthenticationError();
  const permissions = await getEffectivePermissions(user);
  if (!hasModuleAccess(permissions[moduleKey], minimum)) throw new ModulePermissionError(moduleKey);
  return user;
}
