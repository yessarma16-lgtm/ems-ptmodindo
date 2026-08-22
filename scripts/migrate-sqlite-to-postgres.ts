/**
 * One-way, additive migration from the legacy local SQLite database to
 * Supabase Postgres. Run schema initialization first.
 *
 * The source database is read only. Existing Postgres rows are preserved;
 * rows with an existing primary/unique key are skipped so this command is
 * safe to rerun after a partial migration.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const TABLE_ORDER = [
  "departments", "positions", "levels", "skills", "bank", "lookup", "employees",
  "settings", "users", "role_permissions", "contract_history", "family", "bpjs",
  "online_registrations", "export_templates", "export_template_sheets",
  "export_template_columns", "bracket_master", "bracket_master_history", "raw_attendance",
  "calculated_attendance",
];

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set in .env.local.");

  const sqlitePath = process.env.SQLITE_MIGRATION_PATH ?? path.resolve(process.cwd(), "data", "employee.db");
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    for (const table of TABLE_ORDER) {
      const sourceTable = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ).get(table) as { name?: string } | undefined;
      if (!sourceTable?.name) continue;

      const sourceColumns = (sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as { name: string }[])
        .map((column) => column.name);
      const { rows: targetColumns } = await client.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [table],
      );
      const targetSet = new Set(targetColumns.map((column) => column.column_name));
      const columns = sourceColumns.filter((column) => targetSet.has(column) && column !== "id");
      if (columns.length === 0) continue;

      const rows = sqlite.prepare(`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)}`).all() as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log(`${table}: 0 rows`);
        continue;
      }

      const columnSql = columns.map(quoteIdentifier).join(", ");
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      let migrated = 0;
      for (const row of rows) {
        const values = columns.map((column) => row[column] ?? null);
        const result = await client.query(
          `INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        migrated += result.rowCount ?? 0;
      }
      console.log(`${table}: ${migrated}/${rows.length} rows inserted`);
    }
  } finally {
    sqlite.close();
    await client.end();
  }
}

main().catch((error) => {
  console.error("SQLite to Postgres migration failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
