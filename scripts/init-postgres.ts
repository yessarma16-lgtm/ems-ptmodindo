/**
 * CLI entry point for `npm run db:init:postgres`.
 *
 * Creates every table (employees, departments, positions, levels, skills,
 * bank, lookup, users, role_permissions, online_registrations, settings,
 * contract_history, family, bpjs, audit_log, export_template_*) plus the
 * approve_online_registration() function in the Supabase Postgres database,
 * and seeds master data / a default admin user ONLY if empty.
 *
 * Safe to run repeatedly — never drops, clears, or overwrites existing data.
 *
 * Requires SUPABASE_DB_URL in .env.local — the DIRECT Postgres connection
 * string from Supabase (Project Settings -> Database -> Connection string),
 * NOT the same thing as SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY used at
 * runtime (those go through the PostgREST HTTP API; this script needs a raw
 * SQL connection to run CREATE TABLE, which PostgREST can't do). This is the
 * only place in the codebase that connects to Postgres directly instead of
 * through Supabase's HTTP API — a one-time local/CI script, never part of a
 * serverless request path.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log("Postgres connection: FAILED");
    console.log("");
    console.log("SUPABASE_DB_URL is not set in .env.local.");
    console.log("Find it in your Supabase project: Project Settings -> Database -> Connection string (URI).");
    process.exitCode = 1;
    return;
  }

  const { Client } = await import("pg");
  const { ensureSchema, seedMasterDataIfEmpty } = await import("../lib/database/postgres-init");

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Postgres connection: OK");
  } catch (err) {
    console.log("Postgres connection: FAILED");
    console.log("");
    console.log(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  try {
    await ensureSchema(client);
    console.log("Postgres schema: OK");
    console.log("");

    const seeded = await seedMasterDataIfEmpty(client);
    for (const [name, wasSeeded] of Object.entries(seeded)) {
      console.log(`${name}: OK${wasSeeded ? " (seeded)" : ""}`);
    }

    console.log("");
    console.log("Postgres database ready.");
  } catch (err) {
    console.log("");
    console.log("Postgres initialization failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Postgres initialization failed unexpectedly:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
