import "server-only";

import { getDatabaseProvider } from "@/lib/database/database";
import * as sqliteStore from "@/lib/database/sqlite-role-access";
import * as sheetsStore from "@/lib/database/google-sheets-role-access";
import * as postgresStore from "@/lib/database/postgres-role-access";
import type { ModulePermissions } from "@/config/module-permissions";

export type { RoleAccess } from "@/lib/database/sqlite-role-access";

function store() {
  const provider = getDatabaseProvider();
  if (provider === "google") return sheetsStore;
  if (provider === "postgres") return postgresStore;
  return sqliteStore;
}

/** Role Access service — the only module API routes / pages should call for per-role module permissions. */
export async function getAllRoleAccess() {
  return store().getAllRoleAccess();
}

export async function updateRoleAccess(role: string, permissions: Partial<ModulePermissions>) {
  return store().updateRoleAccess(role, permissions);
}
