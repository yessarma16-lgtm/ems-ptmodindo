/**
 * CLI entry point for `npm run db:init:sqlite`.
 *
 * Creates `data/employee.db` if missing, ensures every table exists
 * (employees, departments, positions, levels, skills, banks, lookup,
 * contract_history, family, bpjs, settings, audit_log), and seeds master
 * data tables with a handful of sample rows ONLY if they are empty.
 *
 * Safe to run repeatedly — never drops, clears, or overwrites existing
 * data. No credentials involved; this never touches Google Sheets.
 */

async function main() {
  const { DatabaseSync } = await import("node:sqlite");
  const { ensureDataDir, ensureSchema, seedMasterDataIfEmpty, getDbPath } = await import(
    "../lib/database/sqlite-init"
  );

  ensureDataDir();
  const dbPath = getDbPath();
  const db = new DatabaseSync(dbPath);

  try {
    ensureSchema(db);
    console.log("SQLite schema: OK");
    console.log("");

    const seeded = seedMasterDataIfEmpty(db);
    for (const [name, wasSeeded] of Object.entries(seeded)) {
      console.log(`${name}: OK${wasSeeded ? " (seeded)" : ""}`);
    }

    console.log("");
    console.log(`SQLite database ready: ${dbPath}`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("SQLite initialization failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
