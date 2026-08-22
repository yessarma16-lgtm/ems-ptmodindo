import "server-only";

import * as postgresStore from "@/lib/database/postgres-users";
import { RecordNotFoundError } from "@/lib/database/errors";

export type { User, UserInput, UserWithCredentials } from "@/lib/database/postgres-users";

/**
 * User Management service — the only module API routes / pages should call
 * for User data. Sign-in is username + password. Available on all three
 * providers: SQLite (dev) reads/writes data/employee.db, Google Sheets
 * (being migrated away from) reads/writes the `Users` sheet, Postgres
 * (production, once migrated) reads/writes the `users` table via Supabase.
 */

const store = () => postgresStore;

export class UserNotFoundError extends RecordNotFoundError {
  constructor(id: string) {
    super("User", id);
    this.name = "UserNotFoundError";
  }
}

export async function getUsers() {
  return store().getUsers();
}

export async function getUserById(id: string) {
  return store().getUserById(id);
}

export async function getCurrentUser() {
  return store().getCurrentUser();
}

export async function getUserByUsernameWithCredentials(username: string) {
  return store().getUserByUsernameWithCredentials(username);
}

export async function getUserByIdWithCredentials(id: string) {
  return store().getUserByIdWithCredentials(id);
}

export async function setUserPassword(id: string, hash: string, salt: string) {
  return store().setUserPassword(id, hash, salt);
}

export async function createUser(input: postgresStore.UserInput) {
  return store().createUser(input);
}

export async function updateUser(id: string, input: Partial<postgresStore.UserInput>) {
  return store().updateUser(id, input);
}

export async function toggleUserStatus(id: string) {
  return store().toggleUserStatus(id);
}

export async function deleteUser(id: string) {
  return store().deleteUser(id);
}
