import "server-only";

import {
  ROLE_PERMISSIONS_SHEET_NAME,
  ROLE_PERMISSIONS_SHEET_HEADERS,
  ROLE_PERMISSIONS_LAST_COLUMN,
} from "@/config/master-data-sheets";
import { readSheet, appendRow, updateRow, ensureSheetWithHeaders } from "@/lib/google-sheets";
import { isBlankRow } from "@/lib/database/google-sheets-adapter";
import { RecordNotFoundError } from "@/lib/database/errors";
import { USER_ROLES } from "@/config/user-roles";
import { normalizeModulePermissions, defaultModulePermissions, type ModulePermissions } from "@/config/module-permissions";
import type { RoleAccess } from "@/lib/database/sqlite-role-access";

export type { RoleAccess };

/**
 * Google Sheets implementation of Role Access storage — mirrors
 * lib/database/sqlite-role-access.ts. One row per role in
 * config/user-roles.ts, disambiguated by the ROLE column (same shape as
 * the `Lookup` sheet's TYPE-disambiguated rows).
 */

function parsePermissions(raw: string): ModulePermissions {
  if (!raw) return defaultModulePermissions();
  try {
    return normalizeModulePermissions(JSON.parse(raw));
  } catch {
    return defaultModulePermissions();
  }
}

async function readRoleRows(): Promise<string[][]> {
  await ensureSheetWithHeaders(ROLE_PERMISSIONS_SHEET_NAME, ROLE_PERMISSIONS_SHEET_HEADERS);
  const rows = await readSheet(ROLE_PERMISSIONS_SHEET_NAME, `A2:${ROLE_PERMISSIONS_LAST_COLUMN}`);
  return rows.filter((r) => !isBlankRow(r));
}

function rowToRoleAccess(row: string[]): RoleAccess {
  return { role: row[0] ?? "", permissions: parsePermissions(row[1] ?? ""), updatedAt: row[2] ?? "" };
}

export async function getAllRoleAccess(): Promise<RoleAccess[]> {
  const rows = await readRoleRows();
  const byRole = new Map(rows.map((row) => [row[0], row]));

  // Self-heal: append a default row for any role missing one, appending in
  // the same pass so a later call doesn't hit the Sheets API again for it.
  const now = new Date().toISOString();
  for (const role of USER_ROLES) {
    if (!byRole.has(role)) {
      const row = [role, JSON.stringify(defaultModulePermissions()), now];
      await appendRow(ROLE_PERMISSIONS_SHEET_NAME, row);
      byRole.set(role, row);
    }
  }

  return USER_ROLES.map((role) => rowToRoleAccess(byRole.get(role)!)).sort((a, b) => a.role.localeCompare(b.role));
}

async function findRoleRow(role: string): Promise<{ row: string[]; rowNumber: number } | null> {
  const rows = await readRoleRows();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === role) return { row: rows[i], rowNumber: i + 2 };
  }
  return null;
}

export async function updateRoleAccess(role: string, permissions: Partial<ModulePermissions>): Promise<RoleAccess> {
  // Ensures every role has a row (including this one) before looking it up.
  await getAllRoleAccess();
  const found = await findRoleRow(role);
  if (!found) throw new RecordNotFoundError("Role", role);

  const merged = normalizeModulePermissions({ ...parsePermissions(found.row[1] ?? ""), ...permissions });
  const now = new Date().toISOString();
  await updateRow(ROLE_PERMISSIONS_SHEET_NAME, found.rowNumber, [role, JSON.stringify(merged), now], ROLE_PERMISSIONS_LAST_COLUMN);
  return { role, permissions: merged, updatedAt: now };
}
