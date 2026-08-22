import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLocalPostgresClient } from "@/lib/database/local-postgres-client";

import { DatabaseNotConfiguredError, DatabaseConnectionError, RecordNotFoundError } from "@/lib/database/errors";

/**
 * Low-level Supabase access layer. This is the ONLY module in the codebase
 * allowed to talk to the Supabase (Postgres) API directly. It never runs in
 * the browser (`server-only` import enforces this at build time) and it
 * never exposes credentials — the service-role key lives exclusively in
 * server environment variables (`.env.local` / Vercel prod env vars) and is
 * never sent to the client.
 *
 * This is a PRODUCTION database provider option — see
 * `lib/database/database.ts` for how it's selected via `DATABASE_PROVIDER`,
 * and `lib/database/postgres-adapter.ts` for how it's wired into the
 * provider-agnostic `DatabaseAdapter` interface.
 *
 * Architecture:
 *   UI -> API Route -> Employee/Master Data Service -> DatabaseAdapter -> Supabase Service (this file) -> Supabase (Postgres)
 *
 * Uses the PostgREST HTTP API (via @supabase/supabase-js) rather than a raw
 * TCP Postgres connection — no connection pooling to manage across
 * concurrent Vercel serverless invocations, same request-per-call shape the
 * app already used for Google Sheets.
 */

/** Extends the generic DatabaseNotConfiguredError so callers can catch either name. */
export class SupabaseConfigError extends DatabaseNotConfiguredError {
  constructor(message = "Supabase connection is not configured.") {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/** Extends the generic DatabaseConnectionError so callers can catch either name. */
export class SupabaseConnectionError extends DatabaseConnectionError {
  constructor(message = "Unable to connect to Employee Database.") {
    super(message);
    this.name = "SupabaseConnectionError";
  }
}

interface SupabaseEnv {
  url: string;
  serviceRoleKey: string;
}

function readEnv(): SupabaseEnv | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/** True when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are both set. */
export function isSupabaseConfigured(): boolean {
  return readEnv() !== null;
}

/** Local development uses the same Postgres store modules through a small
 * Supabase-shaped query facade backed by the native `pg` driver. Production
 * remains on Supabase REST unless DATABASE_URL is explicitly provided. */
export function isLocalPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let cachedClient: SupabaseClient | null = null;
let cachedUrl: string | null = null;
let cachedLocalClient: ReturnType<typeof createLocalPostgresClient> | null = null;

function getClient(env: SupabaseEnv): SupabaseClient {
  if (cachedClient && cachedUrl === env.url) return cachedClient;
  cachedClient = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  cachedUrl = env.url;
  return cachedClient;
}

function requireEnv(): SupabaseEnv {
  const env = readEnv();
  if (!env) throw new SupabaseConfigError();
  return env;
}

/**
 * Every call site funnels through here so a network/PostgREST error always
 * surfaces as the same friendly, provider-agnostic message. Domain errors
 * thrown deliberately by adapter code (e.g. RecordNotFoundError from an
 * existence check) pass through unchanged — only unexpected errors (a
 * PostgREST error object, a network failure) get wrapped.
 */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SupabaseConfigError || err instanceof RecordNotFoundError) throw err;
    // Never leak raw PostgREST error details (which can include schema
    // info) to the client — log server-side only.
    console.error("[supabase] request failed:", err);
    throw new SupabaseConnectionError();
  }
}

/** Shared Supabase client for adapter modules (postgres-adapter.ts, postgres-users.ts, etc). Throws SupabaseConfigError if env vars are missing. */
export function getSupabaseClient(): any {
  if (isLocalPostgresConfigured()) {
    if (!cachedLocalClient) cachedLocalClient = createLocalPostgresClient();
    return cachedLocalClient;
  }
  return getClient(requireEnv());
}

export { guarded as supabaseGuarded };
