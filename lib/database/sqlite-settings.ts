import "server-only";

import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { PUBLIC_APPLY_TOKEN_KEY } from "@/lib/database/sqlite-init";

/** Returns the fixed walk-in application token. Always present — seeded by ensurePublicApplyToken on startup. */
export function getPublicApplyToken(): string {
  const db = getSqliteDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(PUBLIC_APPLY_TOKEN_KEY) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

/** Rotates the walk-in application token — any previously printed/shared QR code or link stops working immediately. */
export function regeneratePublicApplyToken(): string {
  const db = getSqliteDb();
  const token = crypto.randomUUID();
  db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = ?").run(
    token,
    new Date().toISOString(),
    PUBLIC_APPLY_TOKEN_KEY,
  );
  return token;
}

/** Generic key/value read — returns "" if the key has never been set. Used for admin-uploaded background images. */
export function getSettingValue(key: string): string {
  const db = getSqliteDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

/** Generic key/value upsert. */
export function setSettingValue(key: string, value: string, description = ""): void {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, description, now);
}

export function deleteSettingValue(key: string): void {
  const db = getSqliteDb();
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
