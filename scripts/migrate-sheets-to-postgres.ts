/**
 * CLI entry point for `npm run db:migrate:sheets-to-postgres`.
 *
 * One-time data migration: reads every table currently in the production
 * Google Spreadsheet and inserts it into the Supabase Postgres database
 * (schema must already exist — run `npm run db:init:postgres` first).
 *
 * Reuses the existing Google Sheets store modules (googleSheetsAdapter,
 * google-sheets-users.ts, etc.) to read data — NOT raw sheet-row parsing —
 * so this always sees exactly what the live app sees today.
 *
 * Preserves `record_id`/UUID values and numeric `id` values EXACTLY as they
 * are in Sheets: `online_registrations.record_id` doubles as the public
 * /apply/[token] URL token (regenerating it would break outstanding shared
 * links), and `users.id` is embedded in existing session cookies. Uses a raw
 * `pg` connection (not the runtime Supabase HTTP client) so explicit
 * id/record_id/timestamp values can be inserted directly — this is the only
 * way to preserve them exactly.
 *
 * Idempotent — every insert is `ON CONFLICT DO NOTHING` keyed on the row's
 * natural identifier, so re-running after a partial failure only inserts
 * what's still missing. Never deletes or modifies Google Sheets data.
 *
 * Requires SUPABASE_DB_URL (same as init-postgres.ts) plus the existing
 * Google Sheets credentials in .env.local.
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
    process.exitCode = 1;
    return;
  }

  const { isGoogleSheetsConfigured, getSpreadsheetMetadata, readSheet } = await import("../lib/google-sheets");
  if (!isGoogleSheetsConfigured()) {
    console.log("Google Sheets connection: FAILED — GOOGLE_SHEETS_SPREADSHEET_ID / SERVICE_ACCOUNT_EMAIL / PRIVATE_KEY not set.");
    process.exitCode = 1;
    return;
  }
  try {
    await getSpreadsheetMetadata();
  } catch {
    console.log("Google Sheets connection: FAILED — could not reach the spreadsheet.");
    process.exitCode = 1;
    return;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    console.log("Postgres connection: FAILED");
    console.log(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  console.log("Google Sheets + Postgres connections: OK");
  console.log("");

  const { googleSheetsAdapter } = await import("../lib/database/google-sheets-adapter");
  const { WRITABLE_EMPLOYEE_COLUMNS } = await import("../lib/database/sqlite-columns");
  const { SIMPLE_MASTER_SHEETS, LOOKUP_TYPES, SETTINGS_SHEET_NAME } = await import("../config/master-data-sheets");
  const usersStore = await import("../lib/database/google-sheets-users");
  const roleAccessStore = await import("../lib/database/google-sheets-role-access");
  const onlineRegStore = await import("../lib/database/google-sheets-online-registrations");

  let totalInserted = 0;
  let totalSkipped = 0;

  function report(name: string, inserted: number, skipped: number) {
    console.log(`${name}: ${inserted} inserted, ${skipped} already present`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  async function resetSerialSequence(table: string, column = "id") {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${column}) FROM ${table}), 1))`,
      [table, column],
    );
  }

  // ---- Employees ----
  {
    const employees = await googleSheetsAdapter.getEmployees();
    let inserted = 0;
    let skipped = 0;
    for (const emp of employees) {
      const columns = ["record_id", ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column), "created_at", "updated_at"];
      const values = [emp.recordId, ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => emp[c.key] ?? ""), emp.createdAt, emp.updatedAt];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const { rowCount } = await client.query(
        `INSERT INTO employees (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT (record_id) DO NOTHING`,
        values,
      );
      if (rowCount) inserted++;
      else skipped++;
    }
    report("Employees", inserted, skipped);
  }

  // ---- Simple master data (Departments, Positions, Levels, Skills, Bank) ----
  for (const [category, tableLabel] of Object.entries(SIMPLE_MASTER_SHEETS)) {
    const table = tableLabel.toLowerCase();
    const items = await googleSheetsAdapter.getSimpleMasterData(category as keyof typeof SIMPLE_MASTER_SHEETS, {
      activeOnly: false,
    });
    let inserted = 0;
    let skipped = 0;
    for (const item of items) {
      const { rowCount } = await client.query(
        `INSERT INTO ${table} (id, code, name, status, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [item.id, item.code, item.name, item.status, item.sortOrder],
      );
      if (rowCount) inserted++;
      else skipped++;
    }
    await resetSerialSequence(table);
    report(tableLabel, inserted, skipped);
  }

  // ---- Lookup ----
  {
    const grouped = await googleSheetsAdapter.getAllLookupIncludingInactive();
    let inserted = 0;
    let skipped = 0;
    for (const { type } of LOOKUP_TYPES) {
      for (const item of grouped[type] ?? []) {
        const { rowCount } = await client.query(
          "INSERT INTO lookup (id, type, code, name, status, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
          [item.id, type, item.code, item.name, item.status, item.sortOrder],
        );
        if (rowCount) inserted++;
        else skipped++;
      }
    }
    await resetSerialSequence("lookup");
    report("Lookup", inserted, skipped);
  }

  // ---- Users (with credentials — password hash/salt carried over exactly, no reset) ----
  {
    const users = await usersStore.getUsers();
    let inserted = 0;
    let skipped = 0;
    for (const u of users) {
      const full = await usersStore.getUserByIdWithCredentials(u.id);
      if (!full) continue;
      const { rowCount } = await client.query(
        `INSERT INTO users (id, record_id, name, username, email, role, status, password_hash, password_salt, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
        [full.id, full.recordId, full.name, full.username, full.email, full.role, full.status, full.passwordHash, full.passwordSalt, full.createdAt, full.updatedAt],
      );
      if (rowCount) inserted++;
      else skipped++;
    }
    await resetSerialSequence("users");
    report("Users", inserted, skipped);
  }

  // ---- Role Access ----
  {
    const roles = await roleAccessStore.getAllRoleAccess();
    let inserted = 0;
    let skipped = 0;
    for (const r of roles) {
      const { rowCount } = await client.query(
        "INSERT INTO role_permissions (role, permissions, updated_at) VALUES ($1, $2, $3) ON CONFLICT (role) DO NOTHING",
        [r.role, JSON.stringify(r.permissions), r.updatedAt],
      );
      if (rowCount) inserted++;
      else skipped++;
    }
    report("Role Access", inserted, skipped);
  }

  // ---- Online Registrations (Recruitment) ----
  {
    const registrations = await onlineRegStore.getOnlineRegistrations();
    let inserted = 0;
    let skipped = 0;
    for (const reg of registrations) {
      const columns = [
        "record_id",
        ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column),
        "registration_status",
        "source_platform",
        "submitted_at",
        "created_at",
        "updated_at",
      ];
      const values = [
        reg.recordId,
        ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => reg[c.key] ?? ""),
        reg.registrationStatus,
        reg.sourcePlatform,
        reg.submittedAt,
        reg.createdAt,
        reg.updatedAt,
      ];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const { rowCount } = await client.query(
        `INSERT INTO online_registrations (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT (record_id) DO NOTHING`,
        values,
      );
      if (rowCount) inserted++;
      else skipped++;
    }
    report("Online Registrations", inserted, skipped);
  }

  // ---- Settings (generic key/value — read raw, since this table has no dedicated "list all" store function) ----
  {
    const rows = (await readSheet(SETTINGS_SHEET_NAME, "A2:D")).filter((r) => r[0]);
    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const [key, value, description, updatedAt] = row;
      const { rowCount } = await client.query(
        "INSERT INTO settings (key, value, description, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING",
        [key ?? "", value ?? "", description ?? "", updatedAt || new Date().toISOString()],
      );
      if (rowCount) inserted++;
      else skipped++;
    }
    report("Settings", inserted, skipped);
  }

  console.log("");
  console.log(`Migration complete: ${totalInserted} rows inserted, ${totalSkipped} already present (unchanged).`);
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
