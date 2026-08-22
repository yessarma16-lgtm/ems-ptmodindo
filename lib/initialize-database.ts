import "server-only";

import { EMPLOYEES_SHEET_NAME, EMPLOYEES_SHEET_HEADERS } from "@/config/employee-fields";
import {
  SIMPLE_MASTER_SHEETS,
  SIMPLE_MASTER_HEADERS,
  SIMPLE_MASTER_LAST_COLUMN,
  LOOKUP_SHEET_NAME,
  LOOKUP_HEADERS,
  LOOKUP_LAST_COLUMN,
  LOOKUP_TYPES,
  SUPPORTING_SHEET_HEADERS,
  USERS_SHEET_NAME,
  USERS_SHEET_HEADERS,
  USERS_LAST_COLUMN,
  ROLE_PERMISSIONS_SHEET_NAME,
  ROLE_PERMISSIONS_SHEET_HEADERS,
  ROLE_PERMISSIONS_LAST_COLUMN,
  type SimpleMasterCategory,
} from "@/config/master-data-sheets";
import { SIMPLE_MASTER_SEED, LOOKUP_SEED } from "@/config/master-data-seed";
import { USER_ROLES } from "@/config/user-roles";
import { defaultModulePermissions } from "@/config/module-permissions";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";
import {
  ensureSheetExists,
  appendRowsIfSheetEmpty,
  GoogleSheetsConfigError,
  GoogleSheetsConnectionError,
} from "@/lib/google-sheets";

export type SheetInitStatus = "created" | "existing" | "error";

export interface SheetInitResult {
  name: string;
  status: SheetInitStatus;
  /** True if sample rows were seeded into a previously empty sheet. */
  seeded?: boolean;
  /** Safe, non-sensitive message — never includes raw Google API errors or credentials. */
  error?: string;
}

export interface DatabaseInitResult {
  ok: boolean;
  results: SheetInitResult[];
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof GoogleSheetsConfigError || err instanceof GoogleSheetsConnectionError) {
    return err.message;
  }
  console.error("[initialize-database] unexpected error:", err);
  return "Unexpected error while initializing this sheet.";
}

async function initSimpleMasterSheet(category: SimpleMasterCategory): Promise<SheetInitResult> {
  const sheetName = SIMPLE_MASTER_SHEETS[category];
  try {
    const { sheetCreated } = await ensureSheetExists(sheetName, SIMPLE_MASTER_HEADERS);
    const seedRows = SIMPLE_MASTER_SEED[category].map((row, idx) => [
      String(idx + 1),
      row.code,
      row.name,
      "Active",
      String(idx + 1),
    ]);
    const seeded = await appendRowsIfSheetEmpty(sheetName, `A2:${SIMPLE_MASTER_LAST_COLUMN}`, seedRows);
    return { name: sheetName, status: sheetCreated ? "created" : "existing", seeded };
  } catch (err) {
    return { name: sheetName, status: "error", error: safeErrorMessage(err) };
  }
}

async function initLookupSheet(): Promise<SheetInitResult> {
  try {
    const { sheetCreated } = await ensureSheetExists(LOOKUP_SHEET_NAME, LOOKUP_HEADERS);

    let nextId = 1;
    const seedRows: string[][] = [];
    for (const { type } of LOOKUP_TYPES) {
      const rows = LOOKUP_SEED[type];
      rows.forEach((row, idx) => {
        seedRows.push([String(nextId++), type, row.code, row.name, "Active", String(idx + 1)]);
      });
    }
    const seeded = await appendRowsIfSheetEmpty(LOOKUP_SHEET_NAME, `A2:${LOOKUP_LAST_COLUMN}`, seedRows);
    return { name: LOOKUP_SHEET_NAME, status: sheetCreated ? "created" : "existing", seeded };
  } catch (err) {
    return { name: LOOKUP_SHEET_NAME, status: "error", error: safeErrorMessage(err) };
  }
}

/** Creates the `Users` sheet and seeds one default admin account — same DEFAULT_PASSWORD used by the SQLite seed — only if the sheet is completely empty. */
async function initUsersSheet(): Promise<SheetInitResult> {
  try {
    const { sheetCreated } = await ensureSheetExists(USERS_SHEET_NAME, USERS_SHEET_HEADERS);
    const now = new Date().toISOString();
    const { hash, salt } = hashPassword(DEFAULT_PASSWORD);
    const seedRows = [
      ["1", crypto.randomUUID(), "Admin User", "admin", "admin@ptmodindo.com", "HR Administrator", "Active", hash, salt, now, now],
    ];
    const seeded = await appendRowsIfSheetEmpty(USERS_SHEET_NAME, `A2:${USERS_LAST_COLUMN}`, seedRows);
    return { name: USERS_SHEET_NAME, status: sheetCreated ? "created" : "existing", seeded };
  } catch (err) {
    return { name: USERS_SHEET_NAME, status: "error", error: safeErrorMessage(err) };
  }
}

/** Creates the `Role_Permissions` sheet and seeds one default-access row per role in config/user-roles.ts, only if the sheet is completely empty. */
async function initRoleAccessSheet(): Promise<SheetInitResult> {
  try {
    const { sheetCreated } = await ensureSheetExists(ROLE_PERMISSIONS_SHEET_NAME, ROLE_PERMISSIONS_SHEET_HEADERS);
    const now = new Date().toISOString();
    const seedRows = USER_ROLES.map((role) => [role, JSON.stringify(defaultModulePermissions()), now]);
    const seeded = await appendRowsIfSheetEmpty(ROLE_PERMISSIONS_SHEET_NAME, `A2:${ROLE_PERMISSIONS_LAST_COLUMN}`, seedRows);
    return { name: ROLE_PERMISSIONS_SHEET_NAME, status: sheetCreated ? "created" : "existing", seeded };
  } catch (err) {
    return { name: ROLE_PERMISSIONS_SHEET_NAME, status: "error", error: safeErrorMessage(err) };
  }
}

async function initSupportingSheet(name: string, headers: string[]): Promise<SheetInitResult> {
  try {
    const { sheetCreated } = await ensureSheetExists(name, headers);
    return { name, status: sheetCreated ? "created" : "existing" };
  } catch (err) {
    return { name, status: "error", error: safeErrorMessage(err) };
  }
}

/**
 * Ensures every sheet in the Employee Database spreadsheet exists with the
 * correct header row:
 *   - `Employees` (55 db_mod.xlsx fields + RECORD_ID/CREATED_AT/UPDATED_AT)
 *   - `Departments`, `Positions`, `Levels`, `Skills`, `Bank` (simple master
 *     data, seeded with a handful of sample rows ONLY if empty)
 *   - `Lookup` (enumerated dropdowns, seeded ONLY if empty)
 *   - `Users` (seeded with one default admin account ONLY if empty)
 *   - `Role_Permissions` (seeded with one row per role ONLY if empty)
 *   - `Contract_History`, `Family`, `BPJS`, `Settings`,
 *     `Online_Registrations` (structure only — Settings and
 *     Online_Registrations have real read/write code, see
 *     lib/database/google-sheets-settings.ts and
 *     google-sheets-online-registrations.ts; the other three are still
 *     prepared for future phases)
 *
 * Never deletes, clears, or overwrites existing sheets/data. Safe to run
 * repeatedly (idempotent).
 */
export async function initializeDatabase(): Promise<DatabaseInitResult> {
  const results: SheetInitResult[] = [];

  try {
    const { sheetCreated } = await ensureSheetExists(EMPLOYEES_SHEET_NAME, EMPLOYEES_SHEET_HEADERS);
    results.push({ name: EMPLOYEES_SHEET_NAME, status: sheetCreated ? "created" : "existing" });
  } catch (err) {
    results.push({ name: EMPLOYEES_SHEET_NAME, status: "error", error: safeErrorMessage(err) });
  }

  for (const category of Object.keys(SIMPLE_MASTER_SHEETS) as SimpleMasterCategory[]) {
    results.push(await initSimpleMasterSheet(category));
  }

  results.push(await initLookupSheet());
  results.push(await initUsersSheet());
  results.push(await initRoleAccessSheet());

  for (const [name, headers] of Object.entries(SUPPORTING_SHEET_HEADERS)) {
    results.push(await initSupportingSheet(name, headers));
  }

  return { ok: results.every((r) => r.status !== "error"), results };
}
