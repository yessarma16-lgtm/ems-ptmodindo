import "server-only";

import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { RecordNotFoundError } from "@/lib/database/errors";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";

/**
 * User Management storage (SQLite-only, like Export Templates). The public
 * `User` shape here never includes password_hash/password_salt — those are
 * only exposed via `*WithCredentials` for login/change-password. Module
 * access is configured per-ROLE, not per-user — see
 * lib/database/sqlite-role-access.ts (still scaffold: stored but not
 * enforced anywhere in the UI).
 */

type SqlRow = Record<string, unknown>;

export interface User {
  id: string;
  recordId: string;
  name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

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

export function getUsers(): User[] {
  const db = getSqliteDb();
  const rows = db.prepare("SELECT * FROM users ORDER BY id ASC").all() as SqlRow[];
  return rows.map(rowToUser);
}

export function getUserById(id: string): User | null {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as SqlRow | undefined;
  return row ? rowToUser(row) : null;
}

/**
 * Internal — includes password_hash/password_salt for login verification.
 * Never return this shape from an API route; use `getUserById`/`getUsers`
 * (the public `User` type) for anything that reaches the client.
 */
export interface UserWithCredentials extends User {
  passwordHash: string;
  passwordSalt: string;
}

export function getUserByUsernameWithCredentials(username: string): UserWithCredentials | null {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username) as
    | SqlRow
    | undefined;
  if (!row) return null;
  return { ...rowToUser(row), passwordHash: str(row.password_hash), passwordSalt: str(row.password_salt) };
}

export function getUserByIdWithCredentials(id: string): UserWithCredentials | null {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as SqlRow | undefined;
  if (!row) return null;
  return { ...rowToUser(row), passwordHash: str(row.password_hash), passwordSalt: str(row.password_salt) };
}

export function setUserPassword(id: string, hash: string, salt: string): void {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) throw new RecordNotFoundError("User", id);
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").run(
    hash,
    salt,
    new Date().toISOString(),
    id,
  );
}

/** No real session exists yet — this returns the first account as a stand-in for "the current user" on My Profile. */
export function getCurrentUser(): User | null {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM users ORDER BY id ASC LIMIT 1").get() as SqlRow | undefined;
  return row ? rowToUser(row) : null;
}

export interface UserInput {
  name: string;
  username: string;
  email: string;
  role: string;
  /** Create: the account's starting password. Update: set only to reset it — omit to leave unchanged. */
  password?: string;
}

export function createUser(input: UserInput): User {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(input.password || DEFAULT_PASSWORD);
  const info = db
    .prepare(
      "INSERT INTO users (record_id, name, username, email, role, status, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?)",
    )
    .run(crypto.randomUUID(), input.name, input.username, input.email, input.role, hash, salt, now, now);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as SqlRow;
  return rowToUser(row);
}

export function updateUser(id: string, input: Partial<UserInput>): User {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) throw new RecordNotFoundError("User", id);

  const setClauses: string[] = [];
  const values: string[] = [];
  if (input.name !== undefined) { setClauses.push("name = ?"); values.push(input.name); }
  if (input.username !== undefined) { setClauses.push("username = ?"); values.push(input.username); }
  if (input.email !== undefined) { setClauses.push("email = ?"); values.push(input.email); }
  if (input.role !== undefined) { setClauses.push("role = ?"); values.push(input.role); }
  if (input.password) {
    const { hash, salt } = hashPassword(input.password);
    setClauses.push("password_hash = ?", "password_salt = ?");
    values.push(hash, salt);
  }
  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());

  db.prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as SqlRow;
  return rowToUser(row);
}

export function toggleUserStatus(id: string): User {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as SqlRow | undefined;
  if (!row) throw new RecordNotFoundError("User", id);
  const nextStatus = str(row.status).toLowerCase() === "active" ? "Inactive" : "Active";
  db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, new Date().toISOString(), id);
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as SqlRow);
}
