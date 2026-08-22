import "server-only";

import * as postgresStore from "@/lib/database/postgres-role-access";
import type { ModulePermissions } from "@/config/module-permissions";

export type { RoleAccess } from "@/lib/database/postgres-role-access";

const store = () => postgresStore;

/** Role Access service — the only module API routes / pages should call for per-role module permissions. */
export async function getAllRoleAccess() {
  return store().getAllRoleAccess();
}

export async function updateRoleAccess(role: string, permissions: Partial<ModulePermissions>) {
  return store().updateRoleAccess(role, permissions);
}
