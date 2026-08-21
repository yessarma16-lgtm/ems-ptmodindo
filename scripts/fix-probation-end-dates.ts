/**
 * CLI entry point for `npm run db:fix:probation-end-dates`.
 *
 * One-time correction: `backfill-probation-contracts.ts` (run earlier) and
 * `repair-contract-dates.ts` (run before its own date-math fix) both
 * computed End Date as Join Date + 3 months − 1 day using local-time date
 * parsing combined with UTC serialization — correct in UTC or a
 * negative-UTC-offset timezone, but on this UTC+7 machine every result came
 * out one calendar day too early. This recomputes and corrects only the
 * still-untouched single-"Probation"-row employees left over from the
 * original backfill (repair-contract-dates.ts already re-ran with the fix
 * and covers its own 3,485 employees).
 *
 * Uses a raw `pg` connection (SUPABASE_DB_URL). Not part of the app's
 * runtime path.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// UTC throughout — see the comment above for why this matters.
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

  // Only rows that still look exactly like the original, untouched backfill:
  // the employee's one-and-only contract_history row, type "Probation",
  // starting on their join date.
  const { rows: targets } = await client.query<{
    id: number;
    join_date: string;
    contract_end: string;
  }>(`
    SELECT ch.id, e.join_date, ch.contract_end
    FROM employees e
    JOIN contract_history ch ON ch.employee_id = e.record_id::text
    WHERE e.join_date <> ''
    GROUP BY ch.id, e.join_date, ch.contract_end, e.record_id
    HAVING (SELECT COUNT(*) FROM contract_history ch2 WHERE ch2.employee_id = e.record_id::text) = 1
       AND ch.contract_type = 'Probation'
       AND ch.contract_start = e.join_date
  `);

  console.log(`${targets.length} single-Probation-row employees to check.`);

  let corrected = 0;
  let alreadyCorrect = 0;
  const now = new Date().toISOString();

  for (const row of targets) {
    const correctEnd = calculateProbationEndDate(row.join_date);
    if (!correctEnd || correctEnd === row.contract_end) {
      alreadyCorrect++;
      continue;
    }
    await client.query("UPDATE contract_history SET contract_end = $2, updated_at = $3 WHERE id = $1", [
      row.id,
      correctEnd,
      now,
    ]);
    corrected++;
  }

  console.log("");
  console.log(`Corrected: ${corrected}. Already correct: ${alreadyCorrect}.`);
  await client.end();
}

main().catch((err) => {
  console.error("Fix failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
