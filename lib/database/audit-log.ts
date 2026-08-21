import "server-only";

import { getSqliteDb } from "@/lib/database/sqlite-connection";

/**
 * Minimal writer for the `audit_log` table (schema already reserved in
 * `sqlite-init.ts` since STEP 2, unused until now). SQLite-only — there is
 * no Google Sheets equivalent, so this must never be called while
 * `DATABASE_PROVIDER=google` is active (callers check `getDatabaseProvider()`
 * first). Never stores binary data, only small JSON-serializable detail.
 * A logging failure must never break the operation being logged, so errors
 * here are swallowed after being logged server-side.
 */
export function writeAuditLog(action: string, entity: string, entityId: string, detail: Record<string, unknown>): void {
  try {
    const db = getSqliteDb();
    db.prepare(
      `INSERT INTO audit_log (record_id, action, entity, entity_id, detail, created_at, user)
       VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM')`,
    ).run(crypto.randomUUID(), action, entity, entityId, JSON.stringify(detail), new Date().toISOString());
  } catch (err) {
    console.error("[audit-log] failed to write entry:", err);
  }
}
