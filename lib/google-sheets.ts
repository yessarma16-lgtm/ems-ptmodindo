import "server-only";
import { google, sheets_v4 } from "googleapis";
import { JWT } from "google-auth-library";

import { DatabaseNotConfiguredError, DatabaseConnectionError } from "@/lib/database/errors";

/**
 * Low-level Google Sheets access layer. This is the ONLY module in the
 * codebase allowed to talk to the Google Sheets API directly. It never runs
 * in the browser (`server-only` import enforces this at build time) and it
 * never exposes credentials — those live exclusively in server environment
 * variables (`.env.local`).
 *
 * This is the PRODUCTION database provider — see `lib/database/database.ts`
 * for how it's selected via `DATABASE_PROVIDER`, and
 * `lib/database/google-sheets-adapter.ts` for how it's wired into the
 * provider-agnostic `DatabaseAdapter` interface. Nothing in this file
 * changed for that refactor.
 *
 * Architecture:
 *   UI -> API Route -> Employee/Master Data Service -> DatabaseAdapter -> Google Sheets Service (this file) -> Google Sheets API
 */

/** Extends the generic DatabaseNotConfiguredError so callers can catch either name. */
export class GoogleSheetsConfigError extends DatabaseNotConfiguredError {
  constructor(message = "Google Spreadsheet connection is not configured.") {
    super(message);
    this.name = "GoogleSheetsConfigError";
  }
}

/** Extends the generic DatabaseConnectionError so callers can catch either name. */
export class GoogleSheetsConnectionError extends DatabaseConnectionError {
  constructor(message = "Unable to connect to Employee Database.") {
    super(message);
    this.name = "GoogleSheetsConnectionError";
  }
}

interface SheetsEnv {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
}

function readEnv(): SheetsEnv | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !privateKeyRaw) return null;

  // .env files store multi-line PEM keys with literal "\n" sequences.
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  return { spreadsheetId, clientEmail, privateKey };
}

/** True when GOOGLE_SHEETS_SPREADSHEET_ID / SERVICE_ACCOUNT_EMAIL / PRIVATE_KEY are all set. */
export function isGoogleSheetsConfigured(): boolean {
  return readEnv() !== null;
}

function requireEnv(): SheetsEnv {
  const env = readEnv();
  if (!env) throw new GoogleSheetsConfigError();
  return env;
}

let cachedClient: sheets_v4.Sheets | null = null;
let cachedClientEmail: string | null = null;

function getClient(env: SheetsEnv): sheets_v4.Sheets {
  if (cachedClient && cachedClientEmail === env.clientEmail) return cachedClient;
  const auth = new JWT({
    email: env.clientEmail,
    key: env.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  cachedClientEmail = env.clientEmail;
  return cachedClient;
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GoogleSheetsConfigError) throw err;
    // Never leak raw Google API error details (which can include request
    // metadata) to the client — log server-side only.
    console.error("[google-sheets] request failed:", err);
    throw new GoogleSheetsConnectionError();
  }
}

/**
 * Short-lived in-memory cache for reads. A single page load can trigger
 * 6-8 separate reads (Employees + every Master Data sheet + the current
 * user's row) — without this, a few page loads in quick succession blow
 * through Google's ~60-reads-per-minute-per-user Sheets API quota and every
 * page fails with a 429. Any write clears the whole cache rather than
 * tracking per-sheet invalidation — writes are far less frequent than
 * reads, and this rules out stale-read bugs after a save.
 */
const READ_CACHE_TTL_MS = 15_000;
const readCache = new Map<string, { data: string[][]; expiresAt: number }>();

function cacheKey(sheetName: string, range: string): string {
  return `${sheetName}::${range}`;
}

function clearReadCache(): void {
  readCache.clear();
}

/** Reads all values from a sheet/range, e.g. readSheet("Employees", "A1:BF"). Served from a short-lived cache when possible — see READ_CACHE_TTL_MS above. */
export async function readSheet(sheetName: string, range = "A:ZZ"): Promise<string[][]> {
  const key = cacheKey(sheetName, range);
  const cached = readCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const env = requireEnv();
  const data = await guarded(async () => {
    const sheets = getClient(env);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!${range}`,
    });
    return (res.data.values as string[][] | undefined) ?? [];
  });

  readCache.set(key, { data, expiresAt: Date.now() + READ_CACHE_TTL_MS });
  return data;
}

/** Appends a single row to the end of a sheet. */
export async function appendRow(sheetName: string, row: (string | number)[]): Promise<void> {
  const env = requireEnv();
  await guarded(async () => {
    const sheets = getClient(env);
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  });
  clearReadCache();
}

/** Overwrites a single existing row (1-indexed, including header row) up to `lastColumn`. */
export async function updateRow(
  sheetName: string,
  rowNumber: number,
  row: (string | number)[],
  lastColumn: string,
): Promise<void> {
  const env = requireEnv();
  await guarded(async () => {
    const sheets = getClient(env);
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!A${rowNumber}:${lastColumn}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  });
  clearReadCache();
}

/** Returns the numeric Google sheetId for a sheet by name (needed for row deletion). */
async function getSheetIdByName(sheetName: string): Promise<number> {
  const env = requireEnv();
  return guarded(async () => {
    const sheets = getClient(env);
    const res = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
    const sheet = res.data.sheets?.find((s) => s.properties?.title === sheetName);
    if (sheet?.properties?.sheetId == null) {
      throw new GoogleSheetsConnectionError(`Sheet "${sheetName}" was not found.`);
    }
    return sheet.properties.sheetId;
  });
}

/** Permanently removes a single row (1-indexed, including header). Use with caution — prefer soft delete via updateRow. */
export async function deleteRow(sheetName: string, rowNumber: number): Promise<void> {
  const env = requireEnv();
  const sheetId = await getSheetIdByName(sheetName);
  await guarded(async () => {
    const sheets = getClient(env);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });
  });
  clearReadCache();
}

/** Fetches spreadsheet-level metadata (title, sheet list) — used for connection testing. */
export async function getSpreadsheetMetadata() {
  const env = requireEnv();
  return guarded(async () => {
    const sheets = getClient(env);
    const res = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
    return {
      title: res.data.properties?.title ?? "",
      sheets: (res.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[],
    };
  });
}

export interface EnsureSheetResult {
  /** True if a new sheet tab was added (it did not exist before). */
  sheetCreated: boolean;
  /** True if a header row was written (only applies when headers are requested). */
  headerWritten: boolean;
}

/**
 * Ensures a sheet tab exists, optionally with a header row. Never overwrites
 * or removes existing sheets/data — if the sheet (or its header) already
 * exists, it is left untouched.
 */
export async function ensureSheetExists(
  sheetName: string,
  headers?: string[],
): Promise<EnsureSheetResult> {
  const env = requireEnv();
  return guarded(async () => {
    const sheets = getClient(env);
    const meta = await sheets.spreadsheets.get({ spreadsheetId: env.spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
    let sheetCreated = false;
    let headerWritten = false;

    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
      });
      sheetCreated = true;
    }

    if (headers && headers.length > 0) {
      const existingValues = await sheets.spreadsheets.values.get({
        spreadsheetId: env.spreadsheetId,
        range: `${sheetName}!A1:A1`,
      });
      const hasHeader = !!existingValues.data.values?.[0]?.[0];
      if (!hasHeader) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: env.spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
        headerWritten = true;
      }
    }

    if (sheetCreated || headerWritten) clearReadCache();
    return { sheetCreated, headerWritten };
  });
}

/** Creates a sheet with the given header row if it does not already exist. Never overwrites existing data. */
export async function ensureSheetWithHeaders(
  sheetName: string,
  headers: string[],
): Promise<EnsureSheetResult> {
  return ensureSheetExists(sheetName, headers);
}

/**
 * Appends seed rows to a sheet ONLY if its data range (below the header) is
 * completely empty. Never touches a sheet that already has any data — safe
 * to call on every `db:init` run. Returns true if rows were written.
 */
export async function appendRowsIfSheetEmpty(
  sheetName: string,
  dataRange: string,
  rows: (string | number)[][],
): Promise<boolean> {
  if (rows.length === 0) return false;
  const env = requireEnv();
  return guarded(async () => {
    const sheets = getClient(env);
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!${dataRange}`,
    });
    const hasData = (existing.data.values ?? []).some((row) =>
      row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""),
    );
    if (hasData) return false;

    await sheets.spreadsheets.values.append({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
    clearReadCache();
    return true;
  });
}

/**
 * Wipes every data row below the header (within `dataRange`) and writes
 * `rows` in its place — a full replace, unlike `appendRowsIfSheetEmpty`
 * (which only ever adds to an empty sheet) or `updateRow`/`deleteRow`
 * (single-row). Two API calls regardless of row count, so this is the right
 * tool for bulk master-data replacement (hundreds of rows) rather than
 * looping single-row calls. Never touches the header row itself.
 */
export async function replaceSheetData(
  sheetName: string,
  dataRange: string,
  rows: (string | number)[][],
): Promise<void> {
  const env = requireEnv();
  await guarded(async () => {
    const sheets = getClient(env);
    await sheets.spreadsheets.values.clear({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!${dataRange}`,
    });
    if (rows.length === 0) return;
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.spreadsheetId,
      range: `${sheetName}!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  });
  clearReadCache();
}
