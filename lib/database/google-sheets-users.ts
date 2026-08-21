import "server-only";

import {
  USERS_SHEET_NAME,
  USERS_SHEET_HEADERS,
  USERS_LAST_COLUMN,
} from "@/config/master-data-sheets";
import { readSheet, appendRow, updateRow, ensureSheetWithHeaders } from "@/lib/google-sheets";
import { isBlankRow, nextNumericId } from "@/lib/database/google-sheets-adapter";
import { RecordNotFoundError } from "@/lib/database/errors";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";
import type { User, UserWithCredentials, UserInput } from "@/lib/database/sqlite-users";

export type { User, UserWithCredentials, UserInput };

/**
 * Google Sheets implementation of User Management storage — mirrors
 * lib/database/sqlite-users.ts function-for-function. `id` is a sequential
 * numeric string (nextNumericId, same scheme as Departments/Positions) so
 * session tokens and /api/users/[id] behave identically regardless of
 * provider.
 */

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

async function ensureUsersSheet(): Promise<void> {
  await ensureSheetWithHeaders(USERS_SHEET_NAME, USERS_SHEET_HEADERS);
}

function rowToUser(row: string[]): User {
  return {
    id: str(row[0]),
    recordId: str(row[1]),
    name: str(row[2]),
    username: str(row[3]),
    email: str(row[4]),
    role: str(row[5]),
    status: str(row[6]) || "Active",
    createdAt: str(row[9]),
    updatedAt: str(row[10]),
  };
}

function rowToUserWithCredentials(row: string[]): UserWithCredentials {
  return { ...rowToUser(row), passwordHash: str(row[7]), passwordSalt: str(row[8]) };
}

function userToRow(user: User, passwordHash: string, passwordSalt: string): string[] {
  return [
    user.id,
    user.recordId,
    user.name,
    user.username,
    user.email,
    user.role,
    user.status,
    passwordHash,
    passwordSalt,
    user.createdAt,
    user.updatedAt,
  ];
}

async function readUsersSheet(): Promise<{ rows: string[][] }> {
  await ensureUsersSheet();
  const rows = await readSheet(USERS_SHEET_NAME, `A2:${USERS_LAST_COLUMN}`);
  return { rows: rows.filter((r) => !isBlankRow(r)) };
}

export async function getUsers(): Promise<User[]> {
  const { rows } = await readUsersSheet();
  return rows.map(rowToUser).sort((a, b) => Number(a.id) - Number(b.id));
}

async function findUserRow(id: string): Promise<{ row: string[]; rowNumber: number } | null> {
  const { rows } = await readUsersSheet();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) return { row: rows[i], rowNumber: i + 2 };
  }
  return null;
}

export async function getUserById(id: string): Promise<User | null> {
  const found = await findUserRow(id);
  return found ? rowToUser(found.row) : null;
}

export async function getUserByUsernameWithCredentials(username: string): Promise<UserWithCredentials | null> {
  const { rows } = await readUsersSheet();
  const row = rows.find((r) => str(r[3]).toLowerCase() === username.toLowerCase());
  return row ? rowToUserWithCredentials(row) : null;
}

export async function getUserByIdWithCredentials(id: string): Promise<UserWithCredentials | null> {
  const found = await findUserRow(id);
  return found ? rowToUserWithCredentials(found.row) : null;
}

export async function setUserPassword(id: string, hash: string, salt: string): Promise<void> {
  const found = await findUserRow(id);
  if (!found) throw new RecordNotFoundError("User", id);
  const user = { ...rowToUser(found.row), updatedAt: new Date().toISOString() };
  await updateRow(USERS_SHEET_NAME, found.rowNumber, userToRow(user, hash, salt), USERS_LAST_COLUMN);
}

/** No real "who's asking" context here — first account, same stand-in as the SQLite version. */
export async function getCurrentUser(): Promise<User | null> {
  const users = await getUsers();
  return users[0] ?? null;
}

export async function createUser(input: UserInput): Promise<User> {
  const { rows } = await readUsersSheet();
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(input.password || DEFAULT_PASSWORD);
  const user: User = {
    id: nextNumericId(rows, 0),
    recordId: crypto.randomUUID(),
    name: input.name,
    username: input.username,
    email: input.email,
    role: input.role,
    status: "Active",
    createdAt: now,
    updatedAt: now,
  };
  await appendRow(USERS_SHEET_NAME, userToRow(user, hash, salt));
  return user;
}

export async function updateUser(id: string, input: Partial<UserInput>): Promise<User> {
  const found = await findUserRow(id);
  if (!found) throw new RecordNotFoundError("User", id);
  const existing = rowToUserWithCredentials(found.row);

  const updated: User = {
    ...existing,
    name: input.name ?? existing.name,
    username: input.username ?? existing.username,
    email: input.email ?? existing.email,
    role: input.role ?? existing.role,
    updatedAt: new Date().toISOString(),
  };
  let { passwordHash, passwordSalt } = existing;
  if (input.password) {
    const { hash, salt } = hashPassword(input.password);
    passwordHash = hash;
    passwordSalt = salt;
  }

  await updateRow(USERS_SHEET_NAME, found.rowNumber, userToRow(updated, passwordHash, passwordSalt), USERS_LAST_COLUMN);
  return updated;
}

export async function toggleUserStatus(id: string): Promise<User> {
  const found = await findUserRow(id);
  if (!found) throw new RecordNotFoundError("User", id);
  const existing = rowToUserWithCredentials(found.row);
  const nextStatus = existing.status.toLowerCase() === "active" ? "Inactive" : "Active";
  const updated: User = { ...existing, status: nextStatus, updatedAt: new Date().toISOString() };
  await updateRow(
    USERS_SHEET_NAME,
    found.rowNumber,
    userToRow(updated, existing.passwordHash, existing.passwordSalt),
    USERS_LAST_COLUMN,
  );
  return updated;
}
