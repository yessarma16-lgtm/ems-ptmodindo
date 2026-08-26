import "server-only";

import { SIMPLE_MASTER_SHEETS, LOOKUP_TYPES, type SimpleMasterCategory } from "@/config/master-data-sheets";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { computeDashboardStats } from "@/lib/database/dashboard-stats";
import { generateFingerCode, nextFingerCodeRunningNumber, buildFingerCode } from "@/lib/database/finger-code";
import { RecordNotFoundError } from "@/lib/database/errors";
import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
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
 * Postgres (Supabase) implementation of `DatabaseAdapter` — a PRODUCTION
 * provider option (`DATABASE_PROVIDER=postgres`), replacing Google Sheets.
 * Talks to Supabase's PostgREST HTTP API via `lib/supabase.ts` — no raw
 * Postgres connection/pooling at runtime. Schema is created ahead of time by
 * `npm run db:init:postgres` (see `lib/database/postgres-init.ts`), not by
 * this file — mirrors how `sqlite-adapter.ts` assumes `ensureSchema()`
 * already ran.
 */

type SqlRow = Record<string, unknown>;

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

/**
 * PostgREST (Supabase's API layer) caps a single `select` response at 1000
 * rows by default — a plain `.select("*")` on a table with more rows than
 * that silently truncates instead of erroring. `employees` crossed 1000
 * rows in production and this was discovered truncating the Active
 * Employees list / dashboard totals. Pages through with `.range()` until a
 * page comes back short.
 */
const SUPABASE_PAGE_SIZE = 1000;

/**
 * Fetches every row of a table page by page (see the 1000-row cap note
 * above), but requests all pages IN PARALLEL instead of one after another.
 * With ~10,000 employees that's 10 pages — sequential awaiting meant 10x a
 * single request's latency (~10s+); firing them together cuts that down to
 * roughly one request's latency total. Gets the total count first (a cheap
 * `head` request) so it knows how many pages to request up front.
 */
async function fetchAllRowsParallel(table: string, columns: string, orderColumn: string): Promise<SqlRow[]> {
  const client = getSupabaseClient();
  const { count, error: countError } = await client.from(table).select("*", { count: "exact", head: true });
  if (countError) throw countError;
  const total = count ?? 0;
  if (total === 0) return [];

  const pageCount = Math.ceil(total / SUPABASE_PAGE_SIZE);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * SUPABASE_PAGE_SIZE;
      return client
        .from(table)
        .select(columns)
        .order(orderColumn, { ascending: true })
        .range(from, from + SUPABASE_PAGE_SIZE - 1);
    }),
  );

  const all: SqlRow[] = [];
  for (const page of pages) {
    if (page.error) throw page.error;
    all.push(...(page.data as unknown as SqlRow[]));
  }
  return all;
}

/** Same pagination concern as fetchAllRowsParallel — used for finger-code generation, which needs every existing code, not just the first 1000, to compute the correct next running number. */
async function fetchAllFingerCodes(): Promise<string[]> {
  const rows = await fetchAllRowsParallel("employees", "finger_code", "id");
  return (rows as unknown as { finger_code: string }[]).map((r) => r.finger_code);
}

async function getEmployees(): Promise<EmployeeRecord[]> {
  return supabaseGuarded(async () => {
    const rows = await fetchAllRowsParallel("employees", "*", "id");
    const records = rows.map(rowToEmployee);
    records.forEach((record, idx) => {
      record.sn = String(idx + 1);
    });
    return records;
  });
}

const LIST_ITEM_COLUMNS =
  "record_id, nik, name, department, position, level, type, category, join_date, exit_date, contract_status, status, interview_evaluation, marital_status";

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
    interviewEvaluation: str(row.interview_evaluation),
    maritalStatus: str(row.marital_status),
  };
}

/** Lean projection for list views — selects only the columns those tables actually use instead of all ~58, cutting both the query and the response payload sent to the browser. */
async function getEmployeeListItems(): Promise<EmployeeListItem[]> {
  return supabaseGuarded(async () => {
    const rows = await fetchAllRowsParallel("employees", LIST_ITEM_COLUMNS, "id");
    return rows.map(rowToListItem);
  });
}

const SORT_COLUMN_MAP: Record<string, string> = {
  name: "name",
  department: "department",
  joinDate: "join_date",
  exitDate: "exit_date",
};

/** Escapes characters that are meaningful to PostgREST's filter-string syntax (comma separates .or() conditions, parens group them) so a search term containing one can't break or hijack the query. */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

/**
 * Search/filter/sort/pagination performed by the database query itself —
 * only the current page's rows come back, not the whole table. This is what
 * actually fixes the Employees list being slow at scale: the earlier
 * getEmployeeListItems() fix only trimmed which COLUMNS came back per row,
 * this trims which ROWS come back at all.
 */
async function getEmployeeListPage(query: EmployeeListQuery): Promise<EmployeeListPage> {
  return supabaseGuarded(async () => {
    let q = getSupabaseClient().from("employees").select(LIST_ITEM_COLUMNS, { count: "exact" });

    if (query.scope === "active") q = q.not("status", "ilike", "inactive");
    else if (query.scope === "inactive") q = q.ilike("status", "inactive");
    else if (query.scope === "expatriate") q = q.ilike("category", "expatriate");

    const search = sanitizeSearchTerm(query.search);
    if (search) q = q.or(`nik.ilike.%${search}%,name.ilike.%${search}%,department.ilike.%${search}%`);
    if (query.department) q = q.eq("department", query.department);
    if (query.status) q = q.eq("status", query.status);
    if (query.contractStatus) q = q.eq("contract_status", query.contractStatus);

    // Join Date on active/expatriate scope, Exit Date on inactive scope —
    // matches whichever date column that list actually displays.
    const dateColumn = query.scope === "inactive" ? "exit_date" : "join_date";
    if (query.dateFrom) q = q.gte(dateColumn, query.dateFrom);
    if (query.dateTo) q = q.lte(dateColumn, query.dateTo);

    const sortColumn = SORT_COLUMN_MAP[query.sortKey] ?? "name";
    q = q.order(sortColumn, { ascending: query.sortAsc });

    const from = (query.page - 1) * query.pageSize;
    q = q.range(from, from + query.pageSize - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    return { items: (data as unknown as SqlRow[]).map(rowToListItem), total: count ?? 0 };
  });
}

async function getEmployeeById(recordId: string): Promise<EmployeeRecord | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("employees")
      .select("*")
      .eq("record_id", recordId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToEmployee(data as SqlRow) : null;
  });
}

async function createEmployee(input: EmployeeInput): Promise<EmployeeRecord> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();

    // Excel import supplies its own FINGER CODE column — trust it instead of
    // auto-generating. The regular Add Employee web form never sends one
    // (the field is always read-only there), so this only ever applies to imports.
    const providedFingerCode = (input.fingerCode ?? "").trim();
    let fingerCode = providedFingerCode;
    if (!fingerCode) {
      fingerCode = generateFingerCode(input.joinDate ?? "", await fetchAllFingerCodes());
    }
    const finalInput: EmployeeInput = { ...input, fingerCode };

    const row: SqlRow = {};
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) row[c.column] = finalInput[c.key] ?? "";

    const { data, error } = await client.from("employees").insert(row).select().single();
    if (error) throw error;
    return rowToEmployee(data as SqlRow);
  });
}

const BULK_INSERT_CHUNK_SIZE = 200;

/**
 * Used by Excel import (potentially thousands of rows). `createEmployee`'s
 * per-row `SELECT finger_code FROM employees` (re-scanning the whole,
 * ever-growing table) plus one INSERT round trip per row is fine for a
 * single Add-Employee submit, but over HTTP it makes a large import too slow
 * to finish inside a serverless function's time limit — exactly what caused
 * the timed-out/"failed" imports this fixes. Fetches existing finger codes
 * ONCE, assigns the rest sequentially in memory, and inserts in chunks
 * (few round trips instead of one per row).
 */
async function bulkCreateEmployees(inputs: EmployeeInput[]): Promise<EmployeeRecord[]> {
  if (inputs.length === 0) return [];
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();

    let nextRunningNumber = nextFingerCodeRunningNumber(await fetchAllFingerCodes());

    const rows: SqlRow[] = inputs.map((input) => {
      const providedFingerCode = (input.fingerCode ?? "").trim();
      const fingerCode = providedFingerCode || buildFingerCode(input.joinDate ?? "", nextRunningNumber++);
      const finalInput: EmployeeInput = { ...input, fingerCode };
      const row: SqlRow = {};
      for (const c of WRITABLE_EMPLOYEE_COLUMNS) row[c.column] = finalInput[c.key] ?? "";
      return row;
    });

    const created: EmployeeRecord[] = [];
    for (let i = 0; i < rows.length; i += BULK_INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + BULK_INSERT_CHUNK_SIZE);
      const { data, error } = await client.from("employees").insert(chunk).select();
      if (error) throw error;
      created.push(...(data as SqlRow[]).map(rowToEmployee));
    }
    return created;
  });
}

async function updateEmployee(recordId: string, input: EmployeeInput): Promise<EmployeeRecord> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client
      .from("employees")
      .select("id")
      .eq("record_id", recordId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("Employee", recordId);

    const patch: SqlRow = {};
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
      if (c.key === "fingerCode") continue; // generated once at creation, immutable afterward
      if (input[c.key] !== undefined) patch[c.column] = input[c.key];
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await client.from("employees").update(patch).eq("record_id", recordId).select().single();
    if (error) throw error;
    return rowToEmployee(data as SqlRow);
  });
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
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client
      .from("employees")
      .select("id")
      .eq("record_id", recordId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("Employee", recordId);

    const { error } = await client.from("employees").delete().eq("record_id", recordId);
    if (error) throw error;
  });
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
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("contract_history")
      .select("*")
      .eq("employee_id", employeeId)
      .order("id", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToContractHistory);
  });
}

async function createContractHistoryEntry(
  employeeId: string,
  input: ContractHistoryInput,
): Promise<ContractHistoryEntry> {
  return supabaseGuarded(async () => {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from("contract_history")
      .insert({
        employee_id: employeeId,
        contract_type: input.contractType,
        contract_start: input.startDate,
        contract_end: input.endDate,
        status: "",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToContractHistory(data as SqlRow);
  });
}

async function updateContractHistoryEntry(id: string, input: ContractHistoryInput): Promise<ContractHistoryEntry> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contract_history")
      .update({
        contract_type: input.contractType,
        contract_start: input.startDate,
        contract_end: input.endDate,
        updated_at: new Date().toISOString(),
      })
      .eq("record_id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Contract history entry", id);
    return rowToContractHistory(data as SqlRow);
  });
}

async function deleteContractHistoryEntry(id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data, error } = await client.from("contract_history").delete().eq("record_id", id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Contract history entry", id);
  });
}

async function getLatestContractEndDates(): Promise<Record<string, string>> {
  return supabaseGuarded(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const client = getSupabaseClient();
    const { count, error: countError } = await client
      .from("contract_history")
      .select("id", { count: "exact", head: true })
      .gte("contract_end", today);
    if (countError) throw countError;

    const total = count ?? 0;
    const pageCount = Math.ceil(total / SUPABASE_PAGE_SIZE);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) => {
        const from = i * SUPABASE_PAGE_SIZE;
        return client
          .from("contract_history")
          .select("employee_id, contract_end")
          .gte("contract_end", today)
          .order("id", { ascending: true })
          .range(from, from + SUPABASE_PAGE_SIZE - 1);
      }),
    );

    const result: Record<string, string> = {};
    for (const page of pages) {
      if (page.error) throw page.error;
      for (const row of (page.data ?? []) as unknown as { employee_id: string; contract_end: string }[]) {
        const current = result[row.employee_id];
        if (!current || row.contract_end < current) result[row.employee_id] = row.contract_end;
      }
    }
    return result;
  });
}

async function getContractEndDates(): Promise<Record<string, string[]>> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { count, error: countError } = await client
      .from("contract_history")
      .select("id", { count: "exact", head: true })
      .neq("contract_end", "");
    if (countError) throw countError;

    const total = count ?? 0;
    const pageCount = Math.ceil(total / SUPABASE_PAGE_SIZE);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) =>
        client
          .from("contract_history")
          .select("employee_id, contract_end")
          .neq("contract_end", "")
          .order("contract_end", { ascending: true })
          .range(i * SUPABASE_PAGE_SIZE, (i + 1) * SUPABASE_PAGE_SIZE - 1),
      ),
    );
    const result: Record<string, string[]> = {};
    for (const page of pages) {
      if (page.error) throw page.error;
      for (const row of (page.data ?? []) as unknown as { employee_id: string; contract_end: string }[]) {
        (result[row.employee_id] ??= []).push(row.contract_end);
      }
    }
    return result;
  });
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
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from(simpleTableName(category)).select("*");
    if (activeOnly) query = query.eq("status", "Active");
    const { data, error } = await query.order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToMasterItem);
  });
}

async function createSimpleMasterDataItem(
  category: SimpleMasterCategory,
  input: CreateMasterDataInput,
): Promise<MasterDataItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const table = simpleTableName(category);
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await client.from(table).select("*", { count: "exact", head: true });
      if (countError) throw countError;
      sortOrder = (count ?? 0) + 1;
    }

    const { data, error } = await client
      .from(table)
      .insert({ code: input.code, name: input.name, status: "Active", sort_order: sortOrder })
      .select()
      .single();
    if (error) throw error;
    return rowToMasterItem(data as SqlRow);
  });
}

async function updateSimpleMasterDataItem(
  category: SimpleMasterCategory,
  id: string,
  input: UpdateMasterDataInput,
): Promise<MasterDataItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const table = simpleTableName(category);
    const { data: existing, error: findError } = await client.from(table).select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError(category, id);

    const patch: SqlRow = {};
    if (input.code !== undefined) patch.code = input.code;
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

    if (Object.keys(patch).length > 0) {
      const { error } = await client.from(table).update(patch).eq("id", id);
      if (error) throw error;
    }

    const { data, error } = await client.from(table).select("*").eq("id", id).single();
    if (error) throw error;
    return rowToMasterItem(data as SqlRow);
  });
}

async function toggleSimpleMasterDataStatus(
  category: SimpleMasterCategory,
  id: string,
): Promise<MasterDataItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const table = simpleTableName(category);
    const { data: row, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) throw new RecordNotFoundError(category, id);
    const nextStatus = str((row as SqlRow).status).toLowerCase() === "active" ? "Inactive" : "Active";
    return updateSimpleMasterDataItem(category, id, { status: nextStatus });
  });
}

async function deleteSimpleMasterDataItem(category: SimpleMasterCategory, id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const table = simpleTableName(category);
    const { data: existing, error: findError } = await client.from(table).select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError(category, id);

    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw error;
  });
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
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from("lookup").select("*").eq("type", type);
    if (activeOnly) query = query.eq("status", "Active");
    const { data, error } = await query.order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToLookupItem);
  });
}

/**
 * Fetches every lookup row in ONE request and groups by `type` client-side,
 * rather than looping `getLookup(type)` per LOOKUP_TYPES entry (15 sequential
 * round trips over Supabase's HTTP API — fine for SQLite's in-process
 * queries, but ~7s of added latency here). `activeOnly` filters before the
 * single fetch so both list variants stay one request each.
 */
async function fetchAllLookupGrouped(activeOnly: boolean): Promise<Record<string, LookupItem[]>> {
  return supabaseGuarded(async () => {
    let query = getSupabaseClient().from("lookup").select("*");
    if (activeOnly) query = query.eq("status", "Active");
    const { data, error } = await query.order("type", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (error) throw error;

    const grouped: Record<string, LookupItem[]> = {};
    for (const { type } of LOOKUP_TYPES) grouped[type] = [];
    for (const row of data as SqlRow[]) {
      const item = rowToLookupItem(row);
      (grouped[item.type] ??= []).push(item);
    }
    return grouped;
  });
}

async function getAllLookup(): Promise<Record<string, LookupItem[]>> {
  return fetchAllLookupGrouped(true);
}

async function getAllLookupIncludingInactive(): Promise<Record<string, LookupItem[]>> {
  return fetchAllLookupGrouped(false);
}

async function createLookupItem(input: CreateLookupInput): Promise<LookupItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await client
        .from("lookup")
        .select("*", { count: "exact", head: true })
        .eq("type", input.type);
      if (countError) throw countError;
      sortOrder = (count ?? 0) + 1;
    }

    const { data, error } = await client
      .from("lookup")
      .insert({ type: input.type, code: input.code, name: input.name, status: "Active", sort_order: sortOrder })
      .select()
      .single();
    if (error) throw error;
    return rowToLookupItem(data as SqlRow);
  });
}

async function updateLookupItem(id: string, input: UpdateLookupInput): Promise<LookupItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client.from("lookup").select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("lookup", id);

    const patch: SqlRow = {};
    if (input.code !== undefined) patch.code = input.code;
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

    if (Object.keys(patch).length > 0) {
      const { error } = await client.from("lookup").update(patch).eq("id", id);
      if (error) throw error;
    }

    const { data, error } = await client.from("lookup").select("*").eq("id", id).single();
    if (error) throw error;
    return rowToLookupItem(data as SqlRow);
  });
}

async function toggleLookupStatus(id: string): Promise<LookupItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: row, error } = await client.from("lookup").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) throw new RecordNotFoundError("lookup", id);
    const nextStatus = str((row as SqlRow).status).toLowerCase() === "active" ? "Inactive" : "Active";
    return updateLookupItem(id, { status: nextStatus });
  });
}

async function deleteLookupItem(id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client.from("lookup").select("id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("lookup", id);

    const { error } = await client.from("lookup").delete().eq("id", id);
    if (error) throw error;
  });
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
  // Schema is created ahead of time by `npm run db:init:postgres` — nothing
  // to do at request time (PostgREST can't run DDL). Matches how the SQLite
  // adapter's ensureReady() just opens the connection.
}

async function testConnection(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { error } = await getSupabaseClient().from("employees").select("id", { count: "exact", head: true });
    if (error) return { ok: false, detail: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Unknown Postgres error." };
  }
}

export const postgresAdapter: DatabaseAdapter = {
  providerName: "postgres",
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
