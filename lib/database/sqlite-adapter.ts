import "server-only";

import { SIMPLE_MASTER_SHEETS, LOOKUP_TYPES, type SimpleMasterCategory } from "@/config/master-data-sheets";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { computeDashboardStats } from "@/lib/database/dashboard-stats";
import { generateFingerCode } from "@/lib/database/finger-code";
import { RecordNotFoundError } from "@/lib/database/errors";
import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { EMPLOYEE_COLUMNS, WRITABLE_EMPLOYEE_COLUMNS } from "@/lib/database/sqlite-columns";
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
  ContractHistoryInput,
} from "@/lib/database/types";

/**
 * SQLite implementation of `DatabaseAdapter` — the DEVELOPMENT provider
 * (`DATABASE_PROVIDER=sqlite`, the default). Reads/writes a single local
 * file at `data/employee.db` via Node's built-in `node:sqlite` module — no
 * native build step, no external service, no Google credentials touched.
 */

type SqlRow = Record<string, unknown>;

const getDb = getSqliteDb;

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------------------------- */
/* Employees                                                                   */
/* -------------------------------------------------------------------------- */

function rowToEmployee(row: SqlRow): EmployeeRecord {
  const record = {
    recordId: str(row.record_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  } as EmployeeRecord;

  for (const c of EMPLOYEE_COLUMNS) {
    record[c.key] = str(row[c.column]);
  }

  const age = calculateAge(record.birthDate);
  record.age = age !== null ? String(age) : "";
  record.masaKerja = calculateMasaKerja(record.joinDate) ?? "";
  return record;
}

async function getEmployees(): Promise<EmployeeRecord[]> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM employees ORDER BY id ASC").all() as SqlRow[];
  const records = rows.map(rowToEmployee);
  records.forEach((record, idx) => {
    record.sn = String(idx + 1);
  });
  return records;
}

const LIST_ITEM_COLUMNS = "record_id, nik, name, department, position, level, type, category, join_date, exit_date, contract_status, status";

function rowToListItem(row: SqlRow): EmployeeListItem {
  return {
    recordId: str(row.record_id),
    nik: str(row.nik),
    name: str(row.name),
    department: str(row.department),
    position: str(row.position),
    level: str(row.level),
    type: str(row.type),
    category: str(row.category),
    joinDate: str(row.join_date),
    exitDate: str(row.exit_date),
    contractStatus: str(row.contract_status),
    status: str(row.status),
  };
}

/** SQLite is local/in-process, so this is mostly for interface parity with the Postgres adapter (where trimming columns actually matters for network payload size) — still a real, if small, win from not building 58 fields per row. */
async function getEmployeeListItems(): Promise<EmployeeListItem[]> {
  const db = getDb();
  const rows = db.prepare(`SELECT ${LIST_ITEM_COLUMNS} FROM employees ORDER BY id ASC`).all() as SqlRow[];
  return rows.map(rowToListItem);
}

const SORT_COLUMN_MAP: Record<string, string> = {
  name: "name",
  department: "department",
  joinDate: "join_date",
  exitDate: "exit_date",
};

/** Same query shape as the Postgres adapter's getEmployeeListPage — mirrored here for interface parity, though SQLite's whole table is cheap enough that getEmployeeListItems() alone was never really the bottleneck locally. */
async function getEmployeeListPage(query: EmployeeListQuery): Promise<EmployeeListPage> {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.scope === "active") where.push("LOWER(status) != 'inactive'");
  else if (query.scope === "inactive") where.push("LOWER(status) = 'inactive'");
  else if (query.scope === "expatriate") where.push("LOWER(category) = 'expatriate'");

  const search = query.search.trim();
  if (search) {
    where.push("(nik LIKE ? OR name LIKE ? OR department LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (query.department) {
    where.push("department = ?");
    params.push(query.department);
  }
  if (query.status) {
    where.push("status = ?");
    params.push(query.status);
  }
  if (query.contractStatus) {
    where.push("contract_status = ?");
    params.push(query.contractStatus);
  }

  // Join Date on active/expatriate scope, Exit Date on inactive scope —
  // matches whichever date column that list actually displays.
  const dateColumn = query.scope === "inactive" ? "exit_date" : "join_date";
  if (query.dateFrom) {
    where.push(`${dateColumn} >= ?`);
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    where.push(`${dateColumn} <= ?`);
    params.push(query.dateTo);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const sortColumn = SORT_COLUMN_MAP[query.sortKey] ?? "name";
  const sortDir = query.sortAsc ? "ASC" : "DESC";

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM employees ${whereSql}`).get(...params) as { c: number };
  const offset = (query.page - 1) * query.pageSize;
  const rows = db
    .prepare(`SELECT ${LIST_ITEM_COLUMNS} FROM employees ${whereSql} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`)
    .all(...params, query.pageSize, offset) as SqlRow[];

  return { items: rows.map(rowToListItem), total: countRow.c };
}

async function getEmployeeById(recordId: string): Promise<EmployeeRecord | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM employees WHERE record_id = ?").get(recordId) as
    | SqlRow
    | undefined;
  return row ? rowToEmployee(row) : null;
}

async function createEmployee(input: EmployeeInput): Promise<EmployeeRecord> {
  const db = getDb();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();

  // Excel import supplies its own FINGER CODE column — trust it instead of
  // auto-generating. The regular Add Employee web form never sends one (the
  // field is always read-only there), so this only ever applies to imports.
  const providedFingerCode = (input.fingerCode ?? "").trim();
  let fingerCode = providedFingerCode;
  if (!fingerCode) {
    const existingFingerCodes = db
      .prepare("SELECT finger_code FROM employees")
      .all() as { finger_code: string }[];
    fingerCode = generateFingerCode(
      input.joinDate ?? "",
      existingFingerCodes.map((r) => r.finger_code),
    );
  }
  const finalInput: EmployeeInput = { ...input, fingerCode };

  const columns = ["record_id", ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column), "created_at", "updated_at"];
  const values: string[] = [
    recordId,
    ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => finalInput[c.key] ?? ""),
    now,
    now,
  ];
  const placeholders = columns.map(() => "?").join(", ");

  db.prepare(`INSERT INTO employees (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);

  return (await getEmployeeById(recordId))!;
}

/** SQLite is a local, in-process file — each createEmployee() call is already effectively free, so a plain loop is fine (no network round trips to batch away, unlike the Postgres adapter). */
async function bulkCreateEmployees(inputs: EmployeeInput[]): Promise<EmployeeRecord[]> {
  const created: EmployeeRecord[] = [];
  for (const input of inputs) created.push(await createEmployee(input));
  return created;
}

async function updateEmployee(recordId: string, input: EmployeeInput): Promise<EmployeeRecord> {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM employees WHERE record_id = ?").get(recordId);
  if (!existing) throw new RecordNotFoundError("Employee", recordId);

  const setClauses: string[] = [];
  const values: string[] = [];
  for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
    if (c.key === "fingerCode") continue; // generated once at creation, immutable afterward
    if (input[c.key] !== undefined) {
      setClauses.push(`${c.column} = ?`);
      values.push(input[c.key]);
    }
  }
  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());

  db.prepare(`UPDATE employees SET ${setClauses.join(", ")} WHERE record_id = ?`).run(
    ...values,
    recordId,
  );

  return (await getEmployeeById(recordId))!;
}

/** STEP 1 delete policy: never permanently remove a row — soft-delete via STATUS/EXIT DATE. */
async function deactivateEmployee(recordId: string): Promise<EmployeeRecord> {
  const current = await getEmployeeById(recordId);
  if (!current) throw new RecordNotFoundError("Employee", recordId);

  const today = new Date().toISOString().slice(0, 10);
  return updateEmployee(recordId, {
    status: "Inactive",
    exitDate: current.exitDate || today,
  });
}

/** Permanently removes an employee row. Irreversible — the Edit Employee page confirms with the user before calling this. */
async function deleteEmployee(recordId: string): Promise<void> {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM employees WHERE record_id = ?").get(recordId);
  if (!existing) throw new RecordNotFoundError("Employee", recordId);
  db.prepare("DELETE FROM employees WHERE record_id = ?").run(recordId);
}

async function getDashboardStats(): Promise<DashboardStats> {
  return computeDashboardStats(await getEmployees());
}

/* -------------------------------------------------------------------------- */
/* Contract history (probation/contract periods per employee)                 */
/* -------------------------------------------------------------------------- */

function rowToContractHistory(row: SqlRow): ContractHistoryEntry {
  return {
    id: str(row.record_id),
    employeeId: str(row.employee_id),
    contractType: str(row.contract_type),
    startDate: str(row.contract_start),
    endDate: str(row.contract_end),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

async function getContractHistory(employeeId: string): Promise<ContractHistoryEntry[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM contract_history WHERE employee_id = ? ORDER BY id ASC")
    .all(employeeId) as SqlRow[];
  return rows.map(rowToContractHistory);
}

async function createContractHistoryEntry(
  employeeId: string,
  input: ContractHistoryInput,
): Promise<ContractHistoryEntry> {
  const db = getDb();
  const recordId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO contract_history (record_id, employee_id, contract_type, contract_start, contract_end, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
  ).run(recordId, employeeId, input.contractType, input.startDate, input.endDate, now, now);
  const row = db.prepare("SELECT * FROM contract_history WHERE record_id = ?").get(recordId) as SqlRow;
  return rowToContractHistory(row);
}

async function updateContractHistoryEntry(id: string, input: ContractHistoryInput): Promise<ContractHistoryEntry> {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare("UPDATE contract_history SET contract_type = ?, contract_start = ?, contract_end = ?, updated_at = ? WHERE record_id = ?")
    .run(input.contractType, input.startDate, input.endDate, now, id);
  if (result.changes === 0) throw new RecordNotFoundError("Contract history entry", id);
  const row = db.prepare("SELECT * FROM contract_history WHERE record_id = ?").get(id) as SqlRow;
  return rowToContractHistory(row);
}

async function deleteContractHistoryEntry(id: string): Promise<void> {
  const db = getDb();
  const result = db.prepare("DELETE FROM contract_history WHERE record_id = ?").run(id);
  if (result.changes === 0) throw new RecordNotFoundError("Contract history entry", id);
}

async function getLatestContractEndDates(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = db
    .prepare("SELECT employee_id, MAX(contract_end) as latest_end FROM contract_history GROUP BY employee_id")
    .all() as { employee_id: string; latest_end: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) result[row.employee_id] = row.latest_end;
  return result;
}

/* -------------------------------------------------------------------------- */
/* Simple master data (Departments, Positions, Levels, Skills, Bank)          */
/* -------------------------------------------------------------------------- */

function simpleTableName(category: SimpleMasterCategory): string {
  return SIMPLE_MASTER_SHEETS[category].toLowerCase();
}

function rowToMasterItem(row: SqlRow): MasterDataItem {
  return {
    id: String(row.id),
    code: str(row.code),
    name: str(row.name),
    status: str(row.status) || "Active",
    sortOrder: num(row.sort_order),
  };
}

async function getSimpleMasterData(
  category: SimpleMasterCategory,
  options: { activeOnly?: boolean } = {},
): Promise<MasterDataItem[]> {
  const { activeOnly = true } = options;
  const db = getDb();
  const table = simpleTableName(category);
  const sql = activeOnly
    ? `SELECT * FROM ${table} WHERE status = 'Active' ORDER BY sort_order ASC, name ASC`
    : `SELECT * FROM ${table} ORDER BY sort_order ASC, name ASC`;
  const rows = db.prepare(sql).all() as SqlRow[];
  return rows.map(rowToMasterItem);
}

async function createSimpleMasterDataItem(
  category: SimpleMasterCategory,
  input: CreateMasterDataInput,
): Promise<MasterDataItem> {
  const db = getDb();
  const table = simpleTableName(category);
  const countRow = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
  const sortOrder = input.sortOrder ?? countRow.c + 1;

  const info = db
    .prepare(`INSERT INTO ${table} (code, name, status, sort_order) VALUES (?, ?, 'Active', ?)`)
    .run(input.code, input.name, sortOrder);

  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid) as SqlRow;
  return rowToMasterItem(row);
}

async function updateSimpleMasterDataItem(
  category: SimpleMasterCategory,
  id: string,
  input: UpdateMasterDataInput,
): Promise<MasterDataItem> {
  const db = getDb();
  const table = simpleTableName(category);
  const existing = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
  if (!existing) throw new RecordNotFoundError(category, id);

  const setClauses: string[] = [];
  const values: (string | number)[] = [];
  if (input.code !== undefined) { setClauses.push("code = ?"); values.push(input.code); }
  if (input.name !== undefined) { setClauses.push("name = ?"); values.push(input.name); }
  if (input.status !== undefined) { setClauses.push("status = ?"); values.push(input.status); }
  if (input.sortOrder !== undefined) { setClauses.push("sort_order = ?"); values.push(input.sortOrder); }

  if (setClauses.length > 0) {
    db.prepare(`UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, id);
  }

  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as SqlRow;
  return rowToMasterItem(row);
}

async function toggleSimpleMasterDataStatus(
  category: SimpleMasterCategory,
  id: string,
): Promise<MasterDataItem> {
  const db = getDb();
  const table = simpleTableName(category);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as SqlRow | undefined;
  if (!row) throw new RecordNotFoundError(category, id);
  const nextStatus = str(row.status).toLowerCase() === "active" ? "Inactive" : "Active";
  return updateSimpleMasterDataItem(category, id, { status: nextStatus });
}

/* -------------------------------------------------------------------------- */
/* Lookup (Category, Type, Shed, Gender, Religion, ...)                       */
/* -------------------------------------------------------------------------- */

function rowToLookupItem(row: SqlRow): LookupItem {
  return { ...rowToMasterItem(row), type: str(row.type) };
}

async function getLookup(
  type: string,
  options: { activeOnly?: boolean } = {},
): Promise<LookupItem[]> {
  const { activeOnly = true } = options;
  const db = getDb();
  const sql = activeOnly
    ? "SELECT * FROM lookup WHERE type = ? AND status = 'Active' ORDER BY sort_order ASC, name ASC"
    : "SELECT * FROM lookup WHERE type = ? ORDER BY sort_order ASC, name ASC";
  const rows = db.prepare(sql).all(type) as SqlRow[];
  return rows.map(rowToLookupItem);
}

async function getAllLookup(): Promise<Record<string, LookupItem[]>> {
  const grouped: Record<string, LookupItem[]> = {};
  for (const { type } of LOOKUP_TYPES) {
    grouped[type] = await getLookup(type, { activeOnly: true });
  }
  return grouped;
}

async function getAllLookupIncludingInactive(): Promise<Record<string, LookupItem[]>> {
  const grouped: Record<string, LookupItem[]> = {};
  for (const { type } of LOOKUP_TYPES) {
    grouped[type] = await getLookup(type, { activeOnly: false });
  }
  return grouped;
}

async function createLookupItem(input: CreateLookupInput): Promise<LookupItem> {
  const db = getDb();
  const countRow = db.prepare("SELECT COUNT(*) as c FROM lookup WHERE type = ?").get(input.type) as {
    c: number;
  };
  const sortOrder = input.sortOrder ?? countRow.c + 1;

  const info = db
    .prepare("INSERT INTO lookup (type, code, name, status, sort_order) VALUES (?, ?, ?, 'Active', ?)")
    .run(input.type, input.code, input.name, sortOrder);

  const row = db.prepare("SELECT * FROM lookup WHERE id = ?").get(info.lastInsertRowid) as SqlRow;
  return rowToLookupItem(row);
}

async function updateLookupItem(id: string, input: UpdateLookupInput): Promise<LookupItem> {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM lookup WHERE id = ?").get(id);
  if (!existing) throw new RecordNotFoundError("lookup", id);

  const setClauses: string[] = [];
  const values: (string | number)[] = [];
  if (input.code !== undefined) { setClauses.push("code = ?"); values.push(input.code); }
  if (input.name !== undefined) { setClauses.push("name = ?"); values.push(input.name); }
  if (input.status !== undefined) { setClauses.push("status = ?"); values.push(input.status); }
  if (input.sortOrder !== undefined) { setClauses.push("sort_order = ?"); values.push(input.sortOrder); }

  if (setClauses.length > 0) {
    db.prepare(`UPDATE lookup SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, id);
  }

  const row = db.prepare("SELECT * FROM lookup WHERE id = ?").get(id) as SqlRow;
  return rowToLookupItem(row);
}

async function toggleLookupStatus(id: string): Promise<LookupItem> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM lookup WHERE id = ?").get(id) as SqlRow | undefined;
  if (!row) throw new RecordNotFoundError("lookup", id);
  const nextStatus = str(row.status).toLowerCase() === "active" ? "Inactive" : "Active";
  return updateLookupItem(id, { status: nextStatus });
}

/* -------------------------------------------------------------------------- */
/* Aggregate + lifecycle                                                      */
/* -------------------------------------------------------------------------- */

async function getAllMasterData(): Promise<AllMasterData> {
  const [departments, positions, levels, skills, banks, lookup] = await Promise.all([
    getSimpleMasterData("departments"),
    getSimpleMasterData("positions"),
    getSimpleMasterData("levels"),
    getSimpleMasterData("skills"),
    getSimpleMasterData("banks"),
    getAllLookup(),
  ]);
  return { departments, positions, levels, skills, banks, lookup };
}

async function ensureReady(): Promise<void> {
  getDb(); // opening the connection already runs ensureSchema()
}

async function testConnection(): Promise<{ ok: boolean; detail?: string }> {
  try {
    getDb().prepare("SELECT 1").get();
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Unknown SQLite error." };
  }
}

export const sqliteAdapter: DatabaseAdapter = {
  providerName: "sqlite",
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

  getSimpleMasterData,
  createSimpleMasterDataItem,
  updateSimpleMasterDataItem,
  toggleSimpleMasterDataStatus,

  getLookup,
  getAllLookup,
  getAllLookupIncludingInactive,
  createLookupItem,
  updateLookupItem,
  toggleLookupStatus,

  getAllMasterData,
};
