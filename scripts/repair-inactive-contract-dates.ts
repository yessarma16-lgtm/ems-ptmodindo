/**
 * CLI entry point for `npm run db:repair:inactive-contract-dates` (dry-run
 * by default; pass --apply to actually write).
 *
 * One-time repair: reads `Repair tanggal.xlsx` (sheet "inactive") and, for
 * every NIK that matches a real employee whose current status is Inactive,
 * replaces their contract_history with the periods chained directly from
 * the sheet's own JOIN DATE and CONTRACT CLOSE-FIRST..FIVETH columns:
 *
 *   Contract 1: start = JOIN DATE,        end = CLOSE-FIRST
 *   Contract 2: start = CLOSE-FIRST + 1d, end = CLOSE-SECOND
 *   ...
 *   stopping at the first empty CLOSE column.
 *
 * If the sheet's 9th column (the "became Permanent on" date — mislabeled
 * "JOIN DATE" a second time in the sheet header, a copy/paste artifact) is
 * set, one more open-ended period is appended: contract_type "Permanent",
 * start = that date, end = "".
 *
 * Unlike the earlier `repair-contract-dates.ts` run, this sheet has no
 * separate CONTRACT STATUS column, and employees.contract_status is
 * intentionally left untouched — only contract_history, contract_criteria,
 * and the legacy contract_close_* flat columns are updated.
 *
 * The sheet's header has a genuine duplicate "JOIN DATE" label (columns 3
 * and 9), so column lookup here is positional, not name-keyed — name-keyed
 * lookup would silently collapse to whichever column appears last.
 *
 * Uses a raw `pg` connection (SUPABASE_DB_URL), same as the other one-time
 * scripts in this folder — not part of the app's runtime path.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const EXCEL_PATH = "c:/Users/DELL/Downloads/Repair tanggal.xlsx";
const SHEET_NAME = "inactive";
const APPLY = process.argv.includes("--apply");

const EXPECTED_HEADER: Record<number, string> = {
  1: "FINGER CODE",
  2: "NIK (EMPLOYEE ID)",
  3: "JOIN DATE",
  4: "CONTRACT CLOSE-FIRST",
  5: "CONTRACT CLOSE-SECOND",
  6: "CONTRACT CLOSE-THIRD",
  7: "CONTRACT CLOSE-FOURTH",
  8: "CONTRACT CLOSE-FIVETH",
  9: "JOIN DATE",
  10: "CONTRACT CRITERIA",
};

function toIsoDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? m[0] : "";
}

// UTC throughout (never mix local-time parsing with UTC output — in
// UTC+7 that silently shifted every result a day early).
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

interface RepairRow {
  nik: string;
  joinDate: string;
  close: string[]; // up to 5, in order, trailing empties trimmed
  permanentDate: string; // "" if not set
  criteria: string;
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log("Postgres connection: FAILED — SUPABASE_DB_URL is not set in .env.local.");
    process.exitCode = 1;
    return;
  }

  console.log(APPLY ? "Mode: APPLY (will write to the database)" : "Mode: DRY RUN (no writes — pass --apply to execute)");
  console.log("");

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) {
    console.log(`Sheet "${SHEET_NAME}" not found in ${EXCEL_PATH}.`);
    process.exitCode = 1;
    return;
  }

  const header = ws.getRow(1).values as unknown[];
  for (const [idx, expected] of Object.entries(EXPECTED_HEADER)) {
    const actual = String(header[Number(idx)] ?? "").trim();
    if (actual !== expected) {
      console.log(`Header mismatch at column ${idx}: expected "${expected}", found "${actual}". Aborting — sheet layout may have changed.`);
      process.exitCode = 1;
      return;
    }
  }

  const rows: RepairRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values as unknown[];
    const nik = String(v[2] ?? "").trim();
    if (!nik) continue;
    const joinDate = toIsoDate(v[3]);
    const close: string[] = [];
    for (const c of [4, 5, 6, 7, 8]) {
      const val = toIsoDate(v[c]);
      if (!val) break; // stop at first empty — no gaps allowed in the chain
      close.push(val);
    }
    const permanentDate = toIsoDate(v[9]);
    const criteria = String(v[10] ?? "").trim();
    rows.push({ nik, joinDate, close, permanentDate, criteria });
  }

  console.log(`${rows.length} rows read from "${SHEET_NAME}".`);
  const withPermanentDate = rows.filter((r) => r.permanentDate).length;
  console.log(`${withPermanentDate} rows have a "became Permanent on" date.`);
  console.log("");

  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Postgres connection: OK");
  console.log("");

  let matched = 0;
  let skippedAlreadyDone = 0;
  let skippedNotInactive = 0;
  let notFound = 0;
  let periodsInserted = 0;
  let permanentPeriodsAdded = 0;
  const notFoundNiks: string[] = [];
  const notInactiveNiks: string[] = [];

  for (const row of rows) {
    const { rows: empRows } = await client.query<{
      record_id: string;
      status: string;
      contract_criteria: string;
      contract_close_first: string;
      contract_close_second: string;
      contract_close_third: string;
      contract_close_fourth: string;
      contract_close_fiveth: string;
    }>(
      `SELECT record_id, status, contract_criteria, contract_close_first, contract_close_second,
              contract_close_third, contract_close_fourth, contract_close_fiveth
       FROM employees WHERE nik = $1`,
      [row.nik],
    );
    if (empRows.length === 0) {
      notFound++;
      notFoundNiks.push(row.nik);
      continue;
    }
    const emp = empRows[0];
    if ((emp.status || "").trim().toLowerCase() !== "inactive") {
      skippedNotInactive++;
      notInactiveNiks.push(row.nik);
      continue;
    }
    const employeeId = emp.record_id;

    let alreadyDone =
      emp.contract_criteria === row.criteria &&
      emp.contract_close_first === (row.close[0] ?? "") &&
      emp.contract_close_second === (row.close[1] ?? "") &&
      emp.contract_close_third === (row.close[2] ?? "") &&
      emp.contract_close_fourth === (row.close[3] ?? "") &&
      emp.contract_close_fiveth === (row.close[4] ?? "");

    if (alreadyDone && row.permanentDate) {
      const { rows: permRows } = await client.query<{ contract_start: string }>(
        "SELECT contract_start FROM contract_history WHERE employee_id = $1 AND contract_type = 'Permanent'",
        [employeeId],
      );
      alreadyDone = permRows.length > 0 && permRows[0].contract_start === row.permanentDate;
    }

    if (alreadyDone) {
      skippedAlreadyDone++;
      continue;
    }
    matched++;

    if (!APPLY) {
      periodsInserted += row.close.length + (row.permanentDate ? 1 : 0);
      if (row.permanentDate) permanentPeriodsAdded++;
      continue;
    }

    await client.query("DELETE FROM contract_history WHERE employee_id = $1", [employeeId]);

    let start = row.joinDate;
    const now = new Date().toISOString();
    for (let i = 0; i < row.close.length; i++) {
      const end = row.close[i];
      await client.query(
        `INSERT INTO contract_history (employee_id, contract_type, contract_start, contract_end, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, '', $5, $5)`,
        [employeeId, `Contract ${i + 1}`, start, end, now],
      );
      periodsInserted++;
      start = addDays(end, 1);
    }

    if (row.permanentDate) {
      await client.query(
        `INSERT INTO contract_history (employee_id, contract_type, contract_start, contract_end, status, created_at, updated_at)
         VALUES ($1, 'Permanent', $2, '', '', $3, $3)`,
        [employeeId, row.permanentDate, now],
      );
      periodsInserted++;
      permanentPeriodsAdded++;
    }

    await client.query(
      `UPDATE employees SET
         contract_criteria = $2,
         contract_close_first = $3,
         contract_close_second = $4,
         contract_close_third = $5,
         contract_close_fourth = $6,
         contract_close_fiveth = $7,
         updated_at = now()
       WHERE record_id = $1`,
      [
        employeeId,
        row.criteria,
        row.close[0] ?? "",
        row.close[1] ?? "",
        row.close[2] ?? "",
        row.close[3] ?? "",
        row.close[4] ?? "",
      ],
    );
  }

  console.log(`Matched: ${matched} employees ${APPLY ? "repaired" : "would be repaired"}.`);
  console.log(`Skipped (already done): ${skippedAlreadyDone}.`);
  console.log(`Skipped (found but not Inactive): ${skippedNotInactive}.`);
  console.log(`Not found: ${notFound}.`);
  console.log(`Contract history periods ${APPLY ? "inserted" : "that would be inserted"}: ${periodsInserted} (including ${permanentPeriodsAdded} "Permanent" open-ended periods).`);
  if (notFoundNiks.length > 0) {
    console.log("NIKs not found in employees table:", notFoundNiks.slice(0, 20).join(", "), notFoundNiks.length > 20 ? `... (+${notFoundNiks.length - 20} more)` : "");
  }
  if (notInactiveNiks.length > 0) {
    console.log("NIKs found but not Inactive:", notInactiveNiks.slice(0, 20).join(", "), notInactiveNiks.length > 20 ? `... (+${notInactiveNiks.length - 20} more)` : "");
  }

  await client.end();
}

main().catch((err) => {
  console.error("Repair failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
