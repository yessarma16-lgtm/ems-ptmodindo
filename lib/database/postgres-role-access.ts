import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { RecordNotFoundError } from "@/lib/database/errors";
import { USER_ROLES } from "@/config/user-roles";
import { normalizeModulePermissions, defaultModulePermissions, type ModulePermissions } from "@/config/module-permissions";
import type { RoleAccess } from "@/lib/database/sqlite-role-access";

export type { RoleAccess };

/**
 * Role Access storage — Postgres (Supabase) mirror of
 * lib/database/sqlite-role-access.ts. Module permissions configured per
 * ROLE, self-healing (missing role rows are inserted on read).
 */

type SqlRow = Record<string, unknown>;

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
async function ensureRoleRows(): Promise<void> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("role_permissions").select("role");
  if (error) throw error;
  const existingRoles = new Set((data as { role: string }[]).map((r) => r.role));

  const missing = USER_ROLES.filter((role) => !existingRoles.has(role));
  if (missing.length === 0) return;

  const now = new Date().toISOString();
  const { error: insertError } = await client.from("role_permissions").insert(
    missing.map((role) => ({ role, permissions: JSON.stringify(defaultModulePermissions()), updated_at: now })),
  );
  if (insertError) throw insertError;
}

export async function getAllRoleAccess(): Promise<RoleAccess[]> {
  return supabaseGuarded(async () => {
    await ensureRoleRows();
    const { data, error } = await getSupabaseClient().from("role_permissions").select("*").order("role", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map((r) => ({
      role: String(r.role),
      permissions: parsePermissions(r.permissions),
      updatedAt: String(r.updated_at),
    }));
  });
}

export async function updateRoleAccess(role: string, permissions: Partial<ModulePermissions>): Promise<RoleAccess> {
  return supabaseGuarded(async () => {
    await ensureRoleRows();
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client
      .from("role_permissions")
      .select("*")
      .eq("role", role)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("Role", role);

    const merged = normalizeModulePermissions({ ...parsePermissions((existing as SqlRow).permissions), ...permissions });
    const now = new Date().toISOString();
    const { error } = await client
      .from("role_permissions")
      .update({ permissions: JSON.stringify(merged), updated_at: now })
      .eq("role", role);
    if (error) throw error;

    return { role, permissions: merged, updatedAt: now };
  });
}
