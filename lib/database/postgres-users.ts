import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { RecordNotFoundError } from "@/lib/database/errors";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";
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
