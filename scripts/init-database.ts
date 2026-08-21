/**
 * CLI entry point for `npm run db:init`.
 *
 * Ensures every sheet in the Employee Database Google Spreadsheet exists
 * (Employees + 11 supporting sheets). Never deletes, clears, or overwrites
 * existing sheets/data. Safe to run multiple times.
 *
 * Never logs credentials — only safe, human-readable status lines.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { isGoogleSheetsConfigured, getSpreadsheetMetadata } = await import("../lib/google-sheets");
  const { initializeDatabase } = await import("../lib/initialize-database");

  if (!isGoogleSheetsConfigured()) {
    console.log("Google Sheets connection: FAILED");
    console.log("");
    console.log(
      "GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY are not set in .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await getSpreadsheetMetadata();
    console.log("Google Sheets connection: OK");
  } catch {
    console.log("Google Sheets connection: FAILED");
    console.log("");
    console.log("Could not reach the spreadsheet. Check sharing permissions and the spreadsheet ID.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Database initialization started...");
  console.log("");

  const { ok, results } = await initializeDatabase();

  for (const r of results) {
    if (r.status === "error") {
      console.log(`${r.name}: ERROR (${r.error ?? "unknown error"})`);
    } else {
      console.log(`${r.name}: OK${r.status === "created" ? " (created)" : ""}`);
    }
  }

  console.log("");
  if (ok) {
    console.log("Database initialization completed successfully.");
  } else {
    console.log("Database initialization completed with errors. See details above.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Database initialization failed unexpectedly:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
