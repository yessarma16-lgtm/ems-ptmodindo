/**
 * CLI entry point for `npm run db:repair:contract-dates`.
 *
 * One-time repair: reads `Repair tanggal.xlsx` (sheet "upload") and, for
 * every NIK that matches a real employee, replaces their contract_history
 * with the periods chained directly from the sheet's own JOIN DATE and
 * CONTRACT CLOSE-FIRST..FIVETH columns — no interpretation of the
 * CONTRACT CRITERIA text, just positional chaining:
 *
 *   Contract 1: start = JOIN DATE,        end = CLOSE-FIRST
 *   Contract 2: start = CLOSE-FIRST + 1d, end = CLOSE-SECOND
 *   Contract 3: start = CLOSE-SECOND + 1d, end = CLOSE-THIRD
 *   Contract 4: start = CLOSE-THIRD + 1d,  end = CLOSE-FOURTH
 *   Contract 5: start = CLOSE-FOURTH + 1d, end = CLOSE-FIVETH
 *
 * stopping at the first empty CLOSE column. Also overwrites the employee's
 * contract_criteria and contract_status columns with the sheet's values
 * verbatim (normalized to Title Case for contract_status to match the
 * CONTRACT_STATUS lookup options), and the legacy contract_close_* flat
 * columns for consistency.
 *
 * Uses a raw `pg` connection (SUPABASE_DB_URL), same as the other one-time
 * scripts in this folder — not part of the app's runtime path.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const EXCEL_PATH = "c:/Users/DELL/Downloads/Repair tanggal.xlsx";
const SHEET_NAME = "upload";

const STATUS_DISPLAY: Record<string, string> = {
  PERMANENT: "Permanent",
  CONTRACT: "Contract",
  PROBATION: "Probation",
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
  criteria: string;
  status: string;
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log("Postgres connection: FAILED — SUPABASE_DB_URL is not set in .env.local.");
    process.exitCode = 1;
    return;
  }

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
  const col: Record<string, number> = {};
  header.forEach((h, i) => {
    if (typeof h === "string") col[h] = i;
  });

  const closeCols = [
    col["CONTRACT CLOSE-FIRST"],
    col["CONTRACT CLOSE-SECOND"],
    col["CONTRACT CLOSE-THIRD"],
    col["CONTRACT CLOSE-FOURTH"],
    col["CONTRACT CLOSE-FIVETH"],
  ];

  const rows: RepairRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const rowValues = ws.getRow(r).values as unknown[];
    const nik = String(rowValues[col["NIK (EMPLOYEE ID)"]] ?? "").trim();
    if (!nik) continue;
    const joinDate = toIsoDate(rowValues[col["JOIN DATE"]]);
    const close: string[] = [];
    for (const c of closeCols) {
      const v = toIsoDate(rowValues[c]);
      if (!v) break; // stop at first empty — no gaps allowed in the chain
      close.push(v);
    }
    const criteria = String(rowValues[col["CONTRACT CRITERIA"]] ?? "").trim();
    const statusRaw = String(rowValues[col["CONTRACT STATUS"]] ?? "").trim().toUpperCase();
    const status = STATUS_DISPLAY[statusRaw] ?? statusRaw;
    rows.push({ nik, joinDate, close, criteria, status });
  }

  console.log(`${rows.length} rows read from "${SHEET_NAME}".`);

  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Postgres connection: OK");
  console.log("");

  let matched = 0;
  let notFound = 0;
  let periodsInserted = 0;
  const notFoundNiks: string[] = [];

  let skipped = 0;
  for (const row of rows) {
    const { rows: empRows } = await client.query<{
      record_id: string;
      contract_criteria: string;
      contract_close_first: string;
      contract_close_second: string;
      contract_close_third: string;
      contract_close_fourth: string;
      contract_close_fiveth: string;
    }>(
      `SELECT record_id, contract_criteria, contract_close_first, contract_close_second,
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
    const employeeId = emp.record_id;

    // Resumable: a prior run of this same idempotent script may have already
    // repaired this employee (the connection to the pooler can drop mid-run
    // on a large batch like this) — skip if its criteria + close dates
    // already match this row exactly, so re-running only does the remaining work.
    let alreadyDone =
      emp.contract_criteria === row.criteria &&
      emp.contract_close_first === (row.close[0] ?? "") &&
      emp.contract_close_second === (row.close[1] ?? "") &&
      emp.contract_close_third === (row.close[2] ?? "") &&
      emp.contract_close_fourth === (row.close[3] ?? "") &&
      emp.contract_close_fiveth === (row.close[4] ?? "");

    // For multi-period employees, also verify contract_history's Contract 2
    // start date was chained correctly (catches rows written before the
    // UTC/local-time fix to addDays(), which computed it a day too early).
    if (alreadyDone && row.close.length >= 2) {
      const expectedSecondStart = addDays(row.close[0], 1);
      const { rows: chRows } = await client.query<{ contract_start: string }>(
        "SELECT contract_start FROM contract_history WHERE employee_id = $1 AND contract_type = 'Contract 2'",
        [employeeId],
      );
      alreadyDone = chRows.length > 0 && chRows[0].contract_start === expectedSecondStart;
    }

    if (alreadyDone) {
      skipped++;
      continue;
    }
    matched++;

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

    await client.query(
      `UPDATE employees SET
         contract_criteria = $2,
         contract_status = $3,
         contract_close_first = $4,
         contract_close_second = $5,
         contract_close_third = $6,
         contract_close_fourth = $7,
         contract_close_fiveth = $8,
         updated_at = now()
       WHERE record_id = $1`,
      [
        employeeId,
        row.criteria,
        row.status,
        row.close[0] ?? "",
        row.close[1] ?? "",
        row.close[2] ?? "",
        row.close[3] ?? "",
        row.close[4] ?? "",
      ],
    );
  }

  console.log(`Matched: ${matched} employees repaired. Skipped (already done): ${skipped}. Not found: ${notFound}.`);
  console.log(`Contract history periods inserted: ${periodsInserted}.`);
  if (notFoundNiks.length > 0) {
    console.log("NIKs not found in employees table:", notFoundNiks.slice(0, 20).join(", "), notFoundNiks.length > 20 ? `... (+${notFoundNiks.length - 20} more)` : "");
  }

  await client.end();
}

main().catch((err) => {
  console.error("Repair failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
