import "server-only";
import { DatabaseSync } from "node:sqlite";

import { ensureDataDir, ensureSchema, getDbPath } from "@/lib/database/sqlite-init";

/**
 * Single shared SQLite connection for the whole app (the Employee/Master
 * Data adapter AND the Export Template store both use this — one file,
 * one connection, one schema-init path).
 *
 * Cached on `globalThis` so Next.js dev-mode Fast Refresh (which can
 * re-evaluate modules many times) reuses one connection instead of opening
 * a new one on every hot reload.
 */
const globalForSqlite = globalThis as unknown as { __employeeSqliteDb?: DatabaseSync };

export function getSqliteDb(): DatabaseSync {
  if (globalForSqlite.__employeeSqliteDb) return globalForSqlite.__employeeSqliteDb;

  ensureDataDir();
  const db = new DatabaseSync(getDbPath());
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(db);

  globalForSqlite.__employeeSqliteDb = db;
  return db;
}
