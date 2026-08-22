import "server-only";

import { getDatabaseAdapter } from "@/lib/database/database";
import { RecordNotFoundError } from "@/lib/database/errors";
import type {
  EmployeeRecord,
  EmployeeInput,
  EmployeeListItem,
  EmployeeListQuery,
  EmployeeListPage,
  EmployeeListScope,
  EmployeeSortKey,
  DashboardStats,
  ContractHistoryEntry,
  ContractHistoryInput,
} from "@/lib/database/types";

export type {
  EmployeeRecord,
  EmployeeInput,
  EmployeeListItem,
  EmployeeListQuery,
  EmployeeListPage,
  EmployeeListScope,
  EmployeeSortKey,
  DashboardStats,
  ContractHistoryEntry,
  ContractHistoryInput,
};

/**
 * Employee domain service. This is the ONLY module the UI (API routes /
 * Server Components) should call for Employee data — it never talks to
 * SQLite or the Google Sheets API directly, delegating to whichever
 * `DatabaseAdapter` is active (see `lib/database/database.ts`).
 *
 *   UI -> API Route -> Employee Service (this file) -> DatabaseAdapter -> SQLite | Google Sheets
 *
 * `RECORD_ID` (a generated UUID) is the permanent identifier for an
 * employee, stable across both providers — never a SQLite row id or a
 * Google Sheets row number.
 */

export class EmployeeNotFoundError extends RecordNotFoundError {
  constructor(recordId: string) {
    super("Employee", recordId);
    this.name = "EmployeeNotFoundError";
  }
}

/** Prepares the active provider's storage (create table/sheet if missing). Never destructive. */
export async function ensureEmployeesSheet(): Promise<void> {
  await getDatabaseAdapter().ensureReady();
}

/** Returns all employees, with SN assigned by current list position and AGE/MASA KERJA computed live. */
export async function getEmployees(): Promise<EmployeeRecord[]> {
  return getDatabaseAdapter().getEmployees();
}

/** Lean projection for list views — see EmployeeListItem. */
export async function getEmployeeListItems(): Promise<EmployeeListItem[]> {
  return getDatabaseAdapter().getEmployeeListItems();
}

/** Search/filter/sort/pagination performed by the database query itself — only the requested page's rows come back. */
export async function getEmployeeListPage(query: EmployeeListQuery): Promise<EmployeeListPage> {
  return getDatabaseAdapter().getEmployeeListPage(query);
}

export async function getEmployeeById(recordId: string): Promise<EmployeeRecord | null> {
  return getDatabaseAdapter().getEmployeeById(recordId);
}

export async function createEmployee(input: EmployeeInput): Promise<EmployeeRecord> {
  return getDatabaseAdapter().createEmployee(input);
}

/** Bulk-imports many rows at once (Excel import) — batches into few requests on providers that talk to the database over HTTP, instead of one round trip per row. */
export async function bulkCreateEmployees(inputs: EmployeeInput[]): Promise<EmployeeRecord[]> {
  return getDatabaseAdapter().bulkCreateEmployees(inputs);
}

export async function updateEmployee(recordId: string, input: EmployeeInput): Promise<EmployeeRecord> {
  try {
    return await getDatabaseAdapter().updateEmployee(recordId, input);
  } catch (err) {
    if (err instanceof RecordNotFoundError) throw new EmployeeNotFoundError(recordId);
    throw err;
  }
}

/** STEP 1 delete policy: never permanently remove a record — soft-delete via STATUS/EXIT DATE. */
export async function deactivateEmployee(recordId: string): Promise<EmployeeRecord> {
  try {
    return await getDatabaseAdapter().deactivateEmployee(recordId);
  } catch (err) {
    if (err instanceof RecordNotFoundError) throw new EmployeeNotFoundError(recordId);
    throw err;
  }
}

/** Permanently removes an employee record. Irreversible — unlike deactivateEmployee's soft-delete. */
export async function deleteEmployee(recordId: string): Promise<void> {
  try {
    await getDatabaseAdapter().deleteEmployee(recordId);
  } catch (err) {
    if (err instanceof RecordNotFoundError) throw new EmployeeNotFoundError(recordId);
    throw err;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return getDatabaseAdapter().getDashboardStats();
}

/** Probation/contract periods for one employee, oldest first. */
export async function getContractHistory(employeeId: string): Promise<ContractHistoryEntry[]> {
  return getDatabaseAdapter().getContractHistory(employeeId);
}

export async function createContractHistoryEntry(
  employeeId: string,
  input: ContractHistoryInput,
): Promise<ContractHistoryEntry> {
  return getDatabaseAdapter().createContractHistoryEntry(employeeId, input);
}

export async function updateContractHistoryEntry(
  id: string,
  input: ContractHistoryInput,
): Promise<ContractHistoryEntry> {
  return getDatabaseAdapter().updateContractHistoryEntry(id, input);
}

export async function deleteContractHistoryEntry(id: string): Promise<void> {
  return getDatabaseAdapter().deleteContractHistoryEntry(id);
}

/** Every employee's most recent contract_history end date, keyed by employee record_id. */
export async function getLatestContractEndDates(): Promise<Record<string, string>> {
  return getDatabaseAdapter().getLatestContractEndDates();
}

export async function getContractEndDates(): Promise<Record<string, string[]>> {
  return getDatabaseAdapter().getContractEndDates();
}
