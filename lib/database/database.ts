import "server-only";

import type { DatabaseAdapter } from "@/lib/database/database-adapter";
import { postgresAdapter } from "@/lib/database/postgres-adapter";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Single centralized place that decides which database provider is active.
 * Nothing else in the app — not the UI, not the API routes, not
 * employee-service.ts / master-data-service.ts — should branch on
 * `DATABASE_PROVIDER` directly. They call `getDatabaseAdapter()` and use
 * the returned `DatabaseAdapter`, never knowing which concrete
 * implementation they got.
 *
 *   DATABASE_PROVIDER=postgres  -> Supabase Postgres adapter (DEV/PROD)
 *   DATABASE_PROVIDER=sqlite    -> SQLite adapter  (data/employee.db)   — tests/legacy
 *   DATABASE_PROVIDER=google    -> Google Sheets adapter (legacy migration source)
 *
 * Defaults to "postgres" so development and production use the same database
 * engine. SQLite remains an explicit opt-in for isolated tests and legacy data
 * migration only.
 * Credentials for a provider that isn't active are never read or used —
 * that provider's methods are simply never called.
 */
export type DatabaseProviderName = "postgres";

export function getDatabaseProvider(): DatabaseProviderName { return "postgres"; }

export function getDatabaseAdapter(): DatabaseAdapter {
  return postgresAdapter;
}

/**
 * True when the active provider is ready to use:
 *  - sqlite: always true (a local file is created on demand, no credentials needed)
 *  - postgres: true only when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are both set
 */
export function isDatabaseConfigured(): boolean { return isSupabaseConfigured(); }
