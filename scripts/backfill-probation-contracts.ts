/**
 * CLI entry point for `npm run db:backfill:probation-contracts`.
 *
 * One-time backfill: creates a "Probation" `contract_history` row (Start =
 * JOIN DATE, End = JOIN DATE + 3 months − 1 day) for every existing employee
 * who doesn't already have any contract_history rows — so the new Contract
 * Information UI (added after these employees were already in the system)
 * has data to show/report on immediately, instead of only for employees
 * created going forward.
 *
 * Idempotent — only touches employees with zero existing contract_history
 * rows, so re-running is safe and never duplicates or overwrites manual
 * entries added after this first run.
 *
 * Uses a raw `pg` connection (SUPABASE_DB_URL), same as
 * migrate-sheets-to-postgres.ts — this is a one-time operational script, not
 * part of the app's runtime path.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// UTC throughout (never mix local-time parsing with UTC output — in
// UTC+7 that silently shifted every result a day early).
function calculateProbationEndDate(joinDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(joinDate);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCMonth(d.getUTCMonth() + 3);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log("Postgres connection: FAILED — SUPABASE_DB_URL is not set in .env.local.");
    process.exitCode = 1;
    return;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Postgres connection: OK");
  console.log("");

  const { rows: employees } = await client.query<{ record_id: string; join_date: string }>(
    `SELECT e.record_id, e.join_date
     FROM employees e
     WHERE e.join_date <> ''
       AND NOT EXISTS (SELECT 1 FROM contract_history ch WHERE ch.employee_id = e.record_id::text)`,
  );

  console.log(`${employees.length} employees with no contract history yet.`);

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const emp of employees) {
    const endDate = calculateProbationEndDate(emp.join_date);
    if (!endDate) {
      skipped++;
      continue;
    }
    await client.query(
      `INSERT INTO contract_history (employee_id, contract_type, contract_start, contract_end, status, created_at, updated_at)
       VALUES ($1, 'Probation', $2, $3, '', $4, $4)`,
      [emp.record_id, emp.join_date, endDate, now],
    );
    inserted++;
  }

  console.log("");
  console.log(`Backfill complete: ${inserted} Probation rows inserted, ${skipped} skipped (invalid JOIN DATE).`);
  await client.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
