import "server-only";

import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { RecordNotFoundError } from "@/lib/database/errors";
import { USER_ROLES } from "@/config/user-roles";
import { normalizeModulePermissions, defaultModulePermissions, type ModulePermissions } from "@/config/module-permissions";
import type { DatabaseSync } from "node:sqlite";

/**
 * Role Access storage — module permissions configured per ROLE (Settings ->
 * User Management -> Role Access tab), not per individual user. Enforced at
 * the API layer via requireModuleAccess() for the Attendance, Report and
 * Recruitment modules; the rest of the list is still display-only scaffold.
 */

type SqlRow = Record<string, unknown>;

export interface RoleAccess {
  role: string;
  permissions: ModulePermissions;
  updatedAt: string;
}

function parsePermissions(raw: unknown): ModulePermissions {
  const text = raw === null || raw === undefined ? "" : String(raw);
  if (!text) return defaultModulePermissions();
  try {
    return normalizeModulePermissions(JSON.parse(text));
  } catch {
    return defaultModulePermissions();
  }
}

/** Ensures every role in config/user-roles.ts has a row, defaulting to full access. Never touches an existing row. */
function ensureRoleRows(db: DatabaseSync): void {
  const now = new Date().toISOString();
  for (const role of USER_ROLES) {
    const existing = db.prepare("SELECT role FROM role_permissions WHERE role = ?").get(role);
    if (!existing) {
      db.prepare("INSERT INTO role_permissions (role, permissions, updated_at) VALUES (?, ?, ?)").run(
        role,
        JSON.stringify(defaultModulePermissions()),
        now,
      );
    }
  }
}

export function getAllRoleAccess(): RoleAccess[] {
  const db = getSqliteDb();
  ensureRoleRows(db);
  const rows = db.prepare("SELECT * FROM role_permissions ORDER BY role ASC").all() as SqlRow[];
  return rows.map((r) => ({
    role: String(r.role),
    permissions: parsePermissions(r.permissions),
    updatedAt: String(r.updated_at),
  }));
}

export function updateRoleAccess(role: string, permissions: Partial<ModulePermissions>): RoleAccess {
  const db = getSqliteDb();
  ensureRoleRows(db);
  const existing = db.prepare("SELECT * FROM role_permissions WHERE role = ?").get(role) as SqlRow | undefined;
  if (!existing) throw new RecordNotFoundError("Role", role);

  const merged = normalizeModulePermissions({ ...parsePermissions(existing.permissions), ...permissions });
  const now = new Date().toISOString();
  db.prepare("UPDATE role_permissions SET permissions = ?, updated_at = ? WHERE role = ?").run(
    JSON.stringify(merged),
    now,
    role,
  );
  return { role, permissions: merged, updatedAt: now };
}
