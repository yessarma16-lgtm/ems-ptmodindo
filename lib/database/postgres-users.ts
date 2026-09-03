import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { RecordNotFoundError } from "@/lib/database/errors";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";
import { PERMISSION_MODULES, sanitizePartialPermissions, type ModulePermissions } from "@/config/module-permissions";
import type { User, UserWithCredentials, UserInput } from "@/lib/database/sqlite-users";

export type { User, UserWithCredentials, UserInput };

/**
 * User Management storage — Postgres (Supabase) mirror of
 * lib/database/sqlite-users.ts. Same shape/behavior; `id` (not `record_id`)
 * is the lookup key everywhere here, matching the SQLite version — it's
 * what session tokens embed and what /api/users/[id] uses.
 */

type SqlRow = Record<string, unknown>;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function rowToUser(row: SqlRow): User {
  return {
    id: String(row.id),
    recordId: str(row.record_id),
    name: str(row.name),
    username: str(row.username),
    email: str(row.email),
    role: str(row.role),
    status: str(row.status) || "Active",
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export async function getUsers(): Promise<User[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("users").select("*").order("id", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToUser);
  });
}

export async function getUserById(id: string): Promise<User | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data as SqlRow) : null;
  });
}

export async function getUserByUsernameWithCredentials(username: string): Promise<UserWithCredentials | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("*")
      .ilike("username", username)
      .eq("status", "Active")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as SqlRow;
    return { ...rowToUser(row), passwordHash: str(row.password_hash), passwordSalt: str(row.password_salt) };
  });
}

export async function getUserByIdWithCredentials(id: string): Promise<UserWithCredentials | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as SqlRow;
    return { ...rowToUser(row), passwordHash: str(row.password_hash), passwordSalt: str(row.password_salt) };
  });
}

export async function setUserPassword(id: string, hash: string, salt: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client.from("users").select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("User", id);

    const { error } = await client
      .from("users")
      .update({ password_hash: hash, password_salt: salt, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  });
}

/** No real session exists yet — this returns the first account as a stand-in for "the current user" on My Profile. */
export async function getCurrentUser(): Promise<User | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data as SqlRow) : null;
  });
}

export async function createUser(input: UserInput): Promise<User> {
  return supabaseGuarded(async () => {
    const { hash, salt } = hashPassword(input.password || DEFAULT_PASSWORD);
    const { data, error } = await getSupabaseClient()
      .from("users")
      .insert({
        name: input.name,
        username: input.username,
        email: input.email,
        role: input.role,
        status: "Active",
        password_hash: hash,
        password_salt: salt,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToUser(data as SqlRow);
  });
}

export async function updateUser(id: string, input: Partial<UserInput>): Promise<User> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client.from("users").select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("User", id);

    const patch: SqlRow = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.username !== undefined) patch.username = input.username;
    if (input.email !== undefined) patch.email = input.email;
    if (input.role !== undefined) patch.role = input.role;
    if (input.password) {
      const { hash, salt } = hashPassword(input.password);
      patch.password_hash = hash;
      patch.password_salt = salt;
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await client.from("users").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return rowToUser(data as SqlRow);
  });
}

export async function toggleUserStatus(id: string): Promise<User> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: row, error } = await client.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) throw new RecordNotFoundError("User", id);
    const nextStatus = str((row as SqlRow).status).toLowerCase() === "active" ? "Inactive" : "Active";
    const { data, error: updateError } = await client
      .from("users")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (updateError) throw updateError;
    return rowToUser(data as SqlRow);
  });
}

export async function deleteUser(id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("users").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new RecordNotFoundError("User", id);
  });
}

/* ---- Individual Access: per-user module-permission override ----
 * Stored as a PARTIAL JSON object in the long-existing `users.permissions`
 * column (only the modules the user overrides from their role). Empty string
 * = no override, user follows their role for every module. */

/**
 * True when a query failed only because the `users.permissions` column isn't
 * there yet (schema migration not run). Lets permission reads degrade to "no
 * override" instead of 503-ing every gated route in an un-migrated env.
 */
function isMissingPermissionsColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "42703" || e?.code === "PGRST204") return true;
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("permissions") && msg.includes("column");
}

function parsePartialPermissions(raw: unknown): Partial<ModulePermissions> {
  const text = raw === null || raw === undefined ? "" : String(raw);
  if (!text) return {};
  try {
    const parsed = sanitizePartialPermissions(JSON.parse(text) as Record<string, unknown>);
    // An old scaffold (pre-Individual-Access) seeded some `users.permissions`
    // rows with a FULL module map. A real per-user override never covers every
    // module — so treat a complete map as "no override, follow the role".
    if (Object.keys(parsed).length >= PERMISSION_MODULES.length) return {};
    return parsed;
  } catch {
    return {};
  }
}

export async function getUserPermissionsOverride(id: string): Promise<Partial<ModulePermissions>> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("users").select("permissions").eq("id", id).maybeSingle();
    if (error) {
      if (isMissingPermissionsColumn(error)) return {};
      throw error;
    }
    return data ? parsePartialPermissions((data as SqlRow).permissions) : {};
  });
}

export async function getAllUserPermissionsOverrides(): Promise<{ id: string; override: Partial<ModulePermissions> }[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("users").select("id,permissions");
    if (error) {
      if (isMissingPermissionsColumn(error)) return [];
      throw error;
    }
    return (data as SqlRow[]).map((r) => ({ id: String(r.id), override: parsePartialPermissions(r.permissions) }));
  });
}

export async function setUserPermissionsOverride(id: string, override: Partial<ModulePermissions>): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client.from("users").select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("User", id);

    const clean = sanitizePartialPermissions(override);
    const value = Object.keys(clean).length > 0 ? JSON.stringify(clean) : "";
    const { error } = await client
      .from("users")
      .update({ permissions: value, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  });
}
