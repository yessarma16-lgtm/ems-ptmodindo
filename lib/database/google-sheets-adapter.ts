import "server-only";

import {
  EMPLOYEE_FIELDS,
  SYSTEM_FIELDS,
  EXTRA_EMPLOYEE_FIELDS,
  EMPLOYEES_SHEET_NAME,
  EMPLOYEES_SHEET_HEADERS,
  EMPLOYEES_LAST_COLUMN,
} from "@/config/employee-fields";
import {
  SIMPLE_MASTER_SHEETS,
  SIMPLE_MASTER_LAST_COLUMN,
  LOOKUP_SHEET_NAME,
  LOOKUP_LAST_COLUMN,
  LOOKUP_TYPES,
  type SimpleMasterCategory,
} from "@/config/master-data-sheets";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { computeDashboardStats } from "@/lib/database/dashboard-stats";
import { generateFingerCode } from "@/lib/database/finger-code";
import { RecordNotFoundError } from "@/lib/database/errors";
import type { DatabaseAdapter } from "@/lib/database/database-adapter";
import type {
  EmployeeRecord,
  EmployeeInput,
  EmployeeListItem,
  EmployeeListQuery,
  EmployeeListPage,
  DashboardStats,
  MasterDataItem,
  LookupItem,
  CreateMasterDataInput,
  UpdateMasterDataInput,
  CreateLookupInput,
  UpdateLookupInput,
  AllMasterData,
  ContractHistoryEntry,
} from "@/lib/database/types";
import {
  readSheet,
  appendRow,
  updateRow,
  deleteRow,
  ensureSheetWithHeaders,
  getSpreadsheetMetadata,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets";

/**
 * Google Sheets implementation of `DatabaseAdapter` — the PRODUCTION
 * provider. This is a straight wrap of the exact logic that lived in
 * `employee-service.ts` / `master-data-service.ts` prior to the SQLite
 * database-abstraction refactor (STEP 2.5) — behavior is unchanged, it is
 * only reorganized behind the shared interface. All actual Google API
 * access still goes through `lib/google-sheets.ts`, unmodified.
 */

export const ALL_EMPLOYEE_COLUMNS = [...EMPLOYEE_FIELDS, ...SYSTEM_FIELDS, ...EXTRA_EMPLOYEE_FIELDS];

export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => !cell || cell.trim() === "");
}

function isActive(status: string): boolean {
  return status.trim().toLowerCase() === "active";
}

function sortItems<T extends MasterDataItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Scans column `idColumnIndex` for the highest existing numeric id and returns the next one — reused wherever a sheet needs SQLite-autoincrement-like ids (Departments/Positions/.../Users). */
export function nextNumericId(rows: string[][], idColumnIndex: number): string {
  let max = 0;
  for (const row of rows) {
    const n = parseInt(row[idColumnIndex], 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

/* -------------------------------------------------------------------------- */
/* Employees                                                                   */
/* -------------------------------------------------------------------------- */

export function rowToEmployee(row: string[]): EmployeeRecord {
  const record = { recordId: "", createdAt: "", updatedAt: "" } as EmployeeRecord;
  ALL_EMPLOYEE_COLUMNS.forEach((field, idx) => {
    record[field.key] = row[idx] ?? "";
  });
  const age = calculateAge(record.birthDate);
  record.age = age !== null ? String(age) : "";
  record.masaKerja = calculateMasaKerja(record.joinDate) ?? "";
  return record;
}

export function employeeToRow(record: EmployeeRecord): string[] {
  return ALL_EMPLOYEE_COLUMNS.map((field) => record[field.key] ?? "");
}

export async function ensureEmployeesSheet(): Promise<void> {
  await ensureSheetWithHeaders(EMPLOYEES_SHEET_NAME, EMPLOYEES_SHEET_HEADERS);
}

async function getEmployees(): Promise<EmployeeRecord[]> {
  await ensureEmployeesSheet();
  const rows = await readSheet(EMPLOYEES_SHEET_NAME, `A2:${EMPLOYEES_LAST_COLUMN}`);
  const records = rows.filter((row) => !isBlankRow(row)).map((row) => rowToEmployee(row));

  records.forEach((record, idx) => {
    record.sn = String(idx + 1);
  });

  return records;
}

/** Sheets reads the whole row range regardless of which columns are needed — no per-column read savings possible — but still trims what gets sent to the browser down to what the list tables actually use. */
async function getEmployeeListItems(): Promise<EmployeeListItem[]> {
  const records = await getEmployees();
  return records.map((r) => ({
    recordId: r.recordId,
    nik: r.nik ?? "",
    name: r.name ?? "",
    department: r.department ?? "",
    position: r.position ?? "",
    level: r.level ?? "",
    type: r.type ?? "",
    category: r.category ?? "",
    joinDate: r.joinDate ?? "",
    exitDate: r.exitDate ?? "",
    contractStatus: r.contractStatus ?? "",
    status: r.status ?? "",
    interviewEvaluation: r.interviewEvaluation ?? "",
    maritalStatus: r.maritalStatus ?? "",
  }));
}

/** Sheets has no server-side query capability — filters/sorts/paginates in memory over the full list. Same cost as before this feature existed (Sheets was never the fast path); Postgres and SQLite do this in the actual query. */
async function getEmployeeListPage(query: EmployeeListQuery): Promise<EmployeeListPage> {
  const all = await getEmployeeListItems();

  let filtered = all;
  if (query.scope === "active") filtered = filtered.filter((e) => (e.status || "").toLowerCase() !== "inactive");
  else if (query.scope === "inactive") filtered = filtered.filter((e) => (e.status || "").toLowerCase() === "inactive");
  else if (query.scope === "expatriate") filtered = filtered.filter((e) => (e.category || "").toLowerCase() === "expatriate");

  const search = query.search.trim().toLowerCase();
  if (search) {
    filtered = filtered.filter((e) => `${e.nik} ${e.name} ${e.department}`.toLowerCase().includes(search));
  }
  if (query.department) filtered = filtered.filter((e) => e.department === query.department);
  if (query.status) filtered = filtered.filter((e) => e.status === query.status);
  if (query.contractStatus) filtered = filtered.filter((e) => e.contractStatus === query.contractStatus);

  // Join Date on active/expatriate scope, Exit Date on inactive scope —
  // matches whichever date column that list actually displays.
  const dateKey = query.scope === "inactive" ? "exitDate" : "joinDate";
  if (query.dateFrom) filtered = filtered.filter((e) => (e[dateKey] || "") >= query.dateFrom);
  if (query.dateTo) filtered = filtered.filter((e) => (e[dateKey] || "") <= query.dateTo);

  const sorted = [...filtered].sort((a, b) => {
    const av = a[query.sortKey] ?? "";
    const bv = b[query.sortKey] ?? "";
    const cmp = av.localeCompare(bv);
    return query.sortAsc ? cmp : -cmp;
  });

  const total = sorted.length;
  const start = (query.page - 1) * query.pageSize;
  const items = sorted.slice(start, start + query.pageSize);
  return { items, total };
}

async function findEmployeeRow(
  recordId: string,
): Promise<{ record: EmployeeRecord; rowNumber: number } | null> {
  await ensureEmployeesSheet();
  const rows = await readSheet(EMPLOYEES_SHEET_NAME, `A2:${EMPLOYEES_LAST_COLUMN}`);
  const recordIdColumnIndex = ALL_EMPLOYEE_COLUMNS.findIndex((f) => f.key === "recordId");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;
    if (row[recordIdColumnIndex] === recordId) {
      return { record: rowToEmployee(row), rowNumber: i + 2 }; // +1 header, +1 to 1-index
    }
  }
  return null;
}

async function getEmployeeById(recordId: string): Promise<EmployeeRecord | null> {
  const found = await findEmployeeRow(recordId);
  return found?.record ?? null;
}

export async function getExistingFingerCodes(): Promise<string[]> {
  const rows = await readSheet(EMPLOYEES_SHEET_NAME, `A2:${EMPLOYEES_LAST_COLUMN}`);
  const fingerCodeColumnIndex = ALL_EMPLOYEE_COLUMNS.findIndex((f) => f.key === "fingerCode");
  return rows.filter((row) => !isBlankRow(row)).map((row) => row[fingerCodeColumnIndex]);
}

async function createEmployee(input: EmployeeInput): Promise<EmployeeRecord> {
  await ensureEmployeesSheet();
  const now = new Date().toISOString();
  const record: EmployeeRecord = {
    recordId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  for (const field of [...EMPLOYEE_FIELDS, ...EXTRA_EMPLOYEE_FIELDS]) {
    if (field.readOnly) continue;
    record[field.key] = input[field.key] ?? "";
  }
  record.age = String(calculateAge(record.birthDate) ?? "");
  record.masaKerja = calculateMasaKerja(record.joinDate) ?? "";
  record.sn = "";
  // Excel import supplies its own FINGER CODE column — trust it instead of
  // auto-generating. The regular Add Employee web form never sends one (the
  // field is always read-only there), so this only ever applies to imports.
  const providedFingerCode = (input.fingerCode ?? "").trim();
  record.fingerCode = providedFingerCode || generateFingerCode(record.joinDate, await getExistingFingerCodes());

  await appendRow(EMPLOYEES_SHEET_NAME, employeeToRow(record));
  return record;
}

/** No batch-append API on the Sheets side to take advantage of here — same per-row cost as createEmployee(), which Sheets imports already had before this option existed. */
async function bulkCreateEmployees(inputs: EmployeeInput[]): Promise<EmployeeRecord[]> {
  const created: EmployeeRecord[] = [];
  for (const input of inputs) created.push(await createEmployee(input));
  return created;
}

async function updateEmployee(recordId: string, input: EmployeeInput): Promise<EmployeeRecord> {
  const found = await findEmployeeRow(recordId);
  if (!found) throw new RecordNotFoundError("Employee", recordId);

  const updated: EmployeeRecord = {
    ...found.record,
    updatedAt: new Date().toISOString(),
  };

  for (const field of [...EMPLOYEE_FIELDS, ...EXTRA_EMPLOYEE_FIELDS]) {
    if (field.readOnly || field.key === "fingerCode") continue;
    if (input[field.key] !== undefined) updated[field.key] = input[field.key];
  }
  updated.age = String(calculateAge(updated.birthDate) ?? "");
  updated.masaKerja = calculateMasaKerja(updated.joinDate) ?? "";

  await updateRow(EMPLOYEES_SHEET_NAME, found.rowNumber, employeeToRow(updated), EMPLOYEES_LAST_COLUMN);
  return updated;
}

/** STEP 1 delete policy: never permanently remove a row — soft-delete via STATUS/EXIT DATE. */
async function deactivateEmployee(recordId: string): Promise<EmployeeRecord> {
  const found = await findEmployeeRow(recordId);
  if (!found) throw new RecordNotFoundError("Employee", recordId);

  const today = new Date().toISOString().slice(0, 10);
  return updateEmployee(recordId, {
    status: "Inactive",
    exitDate: found.record.exitDate || today,
  });
}

/** Permanently removes an employee row. Irreversible — the Edit Employee page confirms with the user before calling this. */
async function deleteEmployee(recordId: string): Promise<void> {
  const found = await findEmployeeRow(recordId);
  if (!found) throw new RecordNotFoundError("Employee", recordId);
  await deleteRow(EMPLOYEES_SHEET_NAME, found.rowNumber);
}

async function getDashboardStats(): Promise<DashboardStats> {
  return computeDashboardStats(await getEmployees());
}

/* -------------------------------------------------------------------------- */
/* Contract history — not supported on this legacy provider (no Sheets tab   */
/* backs it; production runs on Postgres). Reads return empty, writes fail   */
/* with a clear error instead of silently doing nothing.                     */
/* -------------------------------------------------------------------------- */

async function getContractHistory(): Promise<ContractHistoryEntry[]> {
  return [];
}

async function createContractHistoryEntry(): Promise<ContractHistoryEntry> {
  throw new Error("Contract history is not supported on the Google Sheets provider.");
}

async function updateContractHistoryEntry(): Promise<ContractHistoryEntry> {
  throw new Error("Contract history is not supported on the Google Sheets provider.");
}

async function deleteContractHistoryEntry(): Promise<void> {
  throw new Error("Contract history is not supported on the Google Sheets provider.");
}

async function getLatestContractEndDates(): Promise<Record<string, string>> {
  return {};
}

async function getContractEndDates(): Promise<Record<string, string[]>> {
  return {};
}

/* -------------------------------------------------------------------------- */
/* Simple master data (Departments, Positions, Levels, Skills, Bank)          */
/* -------------------------------------------------------------------------- */

function simpleRowToItem(row: string[]): MasterDataItem {
  return {
    id: row[0] ?? "",
    code: row[1] ?? "",
    name: row[2] ?? "",
    status: row[3] ?? "Active",
    sortOrder: Number(row[4]) || 0,
  };
}

function simpleItemToRow(item: MasterDataItem): string[] {
  return [item.id, item.code, item.name, item.status, String(item.sortOrder)];
}

async function readSimpleSheet(
  category: SimpleMasterCategory,
): Promise<{ items: MasterDataItem[]; rows: string[][] }> {
  const sheetName = SIMPLE_MASTER_SHEETS[category];
  const rows = await readSheet(sheetName, `A2:${SIMPLE_MASTER_LAST_COLUMN}`);
  const dataRows = rows.filter((r) => !isBlankRow(r));
  return { items: dataRows.map(simpleRowToItem), rows: dataRows };
}

async function getSimpleMasterData(
  category: SimpleMasterCategory,
  options: { activeOnly?: boolean } = {},
): Promise<MasterDataItem[]> {
  const { activeOnly = true } = options;
  const { items } = await readSimpleSheet(category);
  const filtered = activeOnly ? items.filter((i) => isActive(i.status)) : items;
  return sortItems(filtered);
}

async function findSimpleRow(
  category: SimpleMasterCategory,
  id: string,
): Promise<{ item: MasterDataItem; rowNumber: number } | null> {
  const { rows } = await readSimpleSheet(category);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return { item: simpleRowToItem(rows[i]), rowNumber: i + 2 };
    }
  }
  return null;
}

async function createSimpleMasterDataItem(
  category: SimpleMasterCategory,
  input: CreateMasterDataInput,
): Promise<MasterDataItem> {
  const sheetName = SIMPLE_MASTER_SHEETS[category];
  const { rows } = await readSimpleSheet(category);
  const item: MasterDataItem = {
    id: nextNumericId(rows, 0),
    code: input.code,
    name: input.name,
    status: "Active",
    sortOrder: input.sortOrder ?? rows.length + 1,
  };
  await appendRow(sheetName, simpleItemToRow(item));
  return item;
}

async function updateSimpleMasterDataItem(
  category: SimpleMasterCategory,
  id: string,
  input: UpdateMasterDataInput,
): Promise<MasterDataItem> {
  const sheetName = SIMPLE_MASTER_SHEETS[category];
  const found = await findSimpleRow(category, id);
  if (!found) throw new RecordNotFoundError(category, id);

  const updated: MasterDataItem = { ...found.item, ...input };
  await updateRow(sheetName, found.rowNumber, simpleItemToRow(updated), SIMPLE_MASTER_LAST_COLUMN);
  return updated;
}

async function toggleSimpleMasterDataStatus(
  category: SimpleMasterCategory,
  id: string,
): Promise<MasterDataItem> {
  const found = await findSimpleRow(category, id);
  if (!found) throw new RecordNotFoundError(category, id);
  const nextStatus = isActive(found.item.status) ? "Inactive" : "Active";
  return updateSimpleMasterDataItem(category, id, { status: nextStatus });
}

async function deleteSimpleMasterDataItem(category: SimpleMasterCategory, id: string): Promise<void> {
  const sheetName = SIMPLE_MASTER_SHEETS[category];
  const found = await findSimpleRow(category, id);
  if (!found) throw new RecordNotFoundError(category, id);
  await deleteRow(sheetName, found.rowNumber);
}

/* -------------------------------------------------------------------------- */
/* Lookup sheet (Category, Type, Shed, Gender, Religion, ...)                 */
/* -------------------------------------------------------------------------- */

function lookupRowToItem(row: string[]): LookupItem {
  return {
    id: row[0] ?? "",
    type: row[1] ?? "",
    code: row[2] ?? "",
    name: row[3] ?? "",
    status: row[4] ?? "Active",
    sortOrder: Number(row[5]) || 0,
  };
}

function lookupItemToRow(item: LookupItem): string[] {
  return [item.id, item.type, item.code, item.name, item.status, String(item.sortOrder)];
}

async function readLookupSheet(): Promise<{ items: LookupItem[]; rows: string[][] }> {
  const rows = await readSheet(LOOKUP_SHEET_NAME, `A2:${LOOKUP_LAST_COLUMN}`);
  const dataRows = rows.filter((r) => !isBlankRow(r));
  return { items: dataRows.map(lookupRowToItem), rows: dataRows };
}

async function getLookup(
  type: string,
  options: { activeOnly?: boolean } = {},
): Promise<LookupItem[]> {
  const { activeOnly = true } = options;
  const { items } = await readLookupSheet();
  const filtered = items.filter((i) => i.type === type && (!activeOnly || isActive(i.status)));
  return sortItems(filtered);
}

async function getAllLookup(): Promise<Record<string, LookupItem[]>> {
  const { items } = await readLookupSheet();
  const grouped: Record<string, LookupItem[]> = {};
  for (const { type } of LOOKUP_TYPES) {
    grouped[type] = sortItems(items.filter((i) => i.type === type && isActive(i.status)));
  }
  return grouped;
}

async function getAllLookupIncludingInactive(): Promise<Record<string, LookupItem[]>> {
  const { items } = await readLookupSheet();
  const grouped: Record<string, LookupItem[]> = {};
  for (const { type } of LOOKUP_TYPES) {
    grouped[type] = sortItems(items.filter((i) => i.type === type));
  }
  return grouped;
}

async function findLookupRow(id: string): Promise<{ item: LookupItem; rowNumber: number } | null> {
  const { rows } = await readLookupSheet();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return { item: lookupRowToItem(rows[i]), rowNumber: i + 2 };
    }
  }
  return null;
}

async function createLookupItem(input: CreateLookupInput): Promise<LookupItem> {
  const { rows } = await readLookupSheet();
  const sameTypeCount = rows.filter((r) => r[1] === input.type).length;
  const item: LookupItem = {
    id: nextNumericId(rows, 0),
    type: input.type,
    code: input.code,
    name: input.name,
    status: "Active",
    sortOrder: input.sortOrder ?? sameTypeCount + 1,
  };
  await appendRow(LOOKUP_SHEET_NAME, lookupItemToRow(item));
  return item;
}

async function updateLookupItem(id: string, input: UpdateLookupInput): Promise<LookupItem> {
  const found = await findLookupRow(id);
  if (!found) throw new RecordNotFoundError("lookup", id);

  const updated: LookupItem = { ...found.item, ...input };
  await updateRow(LOOKUP_SHEET_NAME, found.rowNumber, lookupItemToRow(updated), LOOKUP_LAST_COLUMN);
  return updated;
}

async function toggleLookupStatus(id: string): Promise<LookupItem> {
  const found = await findLookupRow(id);
  if (!found) throw new RecordNotFoundError("lookup", id);
  const nextStatus = isActive(found.item.status) ? "Inactive" : "Active";
  return updateLookupItem(id, { status: nextStatus });
}

async function deleteLookupItem(id: string): Promise<void> {
  const found = await findLookupRow(id);
  if (!found) throw new RecordNotFoundError("lookup", id);
  await deleteRow(LOOKUP_SHEET_NAME, found.rowNumber);
}

/* -------------------------------------------------------------------------- */
/* Aggregate + lifecycle                                                      */
/* -------------------------------------------------------------------------- */

async function getAllMasterData(): Promise<AllMasterData> {
  const [departments, positions, levels, skills, banks, vacantPositions, lookup] = await Promise.all([
    getSimpleMasterData("departments"),
    getSimpleMasterData("positions"),
    getSimpleMasterData("levels"),
    getSimpleMasterData("skills"),
    getSimpleMasterData("banks"),
    getSimpleMasterData("vacantPositions"),
    getAllLookup(),
  ]);
  return { departments, positions, levels, skills, banks, vacantPositions, lookup };
}

async function ensureReady(): Promise<void> {
  await ensureEmployeesSheet();
}

async function testConnection(): Promise<{ ok: boolean; detail?: string }> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: false, detail: "Google Spreadsheet connection is not configured." };
  }
  try {
    await getSpreadsheetMetadata();
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Unable to connect to Employee Database." };
  }
}

export const googleSheetsAdapter: DatabaseAdapter = {
  // Keep the legacy adapter's contract explicit for type-checking deployments.
  providerName: "google",
  ensureReady,
  testConnection,

  getEmployees,
  getEmployeeListItems,
  getEmployeeListPage,
  getEmployeeById,
  createEmployee,
  bulkCreateEmployees,
  updateEmployee,
  deactivateEmployee,
  deleteEmployee,
  getDashboardStats,

  getContractHistory,
  createContractHistoryEntry,
  updateContractHistoryEntry,
  deleteContractHistoryEntry,
  getLatestContractEndDates,
  getContractEndDates,

  getSimpleMasterData,
  createSimpleMasterDataItem,
  updateSimpleMasterDataItem,
  toggleSimpleMasterDataStatus,
  deleteSimpleMasterDataItem,

  getLookup,
  getAllLookup,
  getAllLookupIncludingInactive,
  createLookupItem,
  updateLookupItem,
  toggleLookupStatus,
  deleteLookupItem,

  getAllMasterData,
};
