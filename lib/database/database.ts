import "server-only";

import type { DatabaseAdapter } from "@/lib/database/database-adapter";
import { sqliteAdapter } from "@/lib/database/sqlite-adapter";
import { googleSheetsAdapter } from "@/lib/database/google-sheets-adapter";
import { postgresAdapter } from "@/lib/database/postgres-adapter";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Single centralized place that decides which database provider is active.
 * Nothing else in the app — not the UI, not the API routes, not
 * employee-service.ts / master-data-service.ts — should branch on
 * `DATABASE_PROVIDER` directly. They call `getDatabaseAdapter()` and use
 * the returned `DatabaseAdapter`, never knowing which concrete
 * implementation they got.
 *
 *   DATABASE_PROVIDER=sqlite    -> SQLite adapter  (data/employee.db)   — development
 *   DATABASE_PROVIDER=google    -> Google Sheets adapter (being migrated away from)
 *   DATABASE_PROVIDER=postgres  -> Supabase Postgres adapter (production, once migrated)
 *
 * Defaults to "sqlite" when unset, since that is the development default.
 * Credentials for a provider that isn't active are never read or used —
 * that provider's methods are simply never called.
 */
export type DatabaseProviderName = "sqlite" | "google" | "postgres";

export function getDatabaseProvider(): DatabaseProviderName {
  const raw = (process.env.DATABASE_PROVIDER ?? "sqlite").trim().toLowerCase();
  if (raw === "google") return "google";
  if (raw === "postgres") return "postgres";
  return "sqlite";
}

export function getDatabaseAdapter(): DatabaseAdapter {
  const provider = getDatabaseProvider();
  if (provider === "google") return googleSheetsAdapter;
  if (provider === "postgres") return postgresAdapter;
  return sqliteAdapter;
}

/**
 * True when the active provider is ready to use:
 *  - sqlite: always true (a local file is created on demand, no credentials needed)
 *  - google: true only when GOOGLE_SHEETS_SPREADSHEET_ID / SERVICE_ACCOUNT_EMAIL / PRIVATE_KEY are all set
 *  - postgres: true only when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are both set
 */
export function isDatabaseConfigured(): boolean {
  const provider = getDatabaseProvider();
  if (provider === "google") return isGoogleSheetsConfigured();
  if (provider === "postgres") return isSupabaseConfigured();
  return true;
}
