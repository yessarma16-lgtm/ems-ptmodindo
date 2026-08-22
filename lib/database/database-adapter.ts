import type { SimpleMasterCategory } from "@/config/master-data-sheets";
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
 * The single contract every database provider (SQLite for development,
 * Google Sheets for production) must implement. Nothing above this layer —
 * UI, API routes, employee-service.ts, master-data-service.ts — is allowed
 * to know which concrete provider is behind it.
 *
 *   Browser -> API Route -> Employee/Master Data Service -> DatabaseAdapter -> SQLite | Google Sheets
 */
export interface DatabaseAdapter {
  /** Human-readable provider name, e.g. "sqlite" or "google". Used only for display (Settings/health check). */
  readonly providerName: string;

  /** Prepares the underlying storage (create tables / sheets if missing). Never destructive. */
  ensureReady(): Promise<void>;

  /** Lightweight connectivity check for the health endpoint. Never throws. */
  testConnection(): Promise<{ ok: boolean; detail?: string }>;

  // Employees
  getEmployees(): Promise<EmployeeRecord[]>;
  /** Lean projection for list views (Active/Inactive/Expatriate tables) — only the fields those tables display/filter by, not the full ~58-field record. */
  getEmployeeListItems(): Promise<EmployeeListItem[]>;
  /** Search/filter/sort/pagination performed in the database query itself — only the current page's rows are returned, not the whole table. */
  getEmployeeListPage(query: EmployeeListQuery): Promise<EmployeeListPage>;
  getEmployeeById(recordId: string): Promise<EmployeeRecord | null>;
  createEmployee(input: EmployeeInput): Promise<EmployeeRecord>;
  /** Bulk-imports many rows at once — providers that talk to the database over HTTP (Postgres) batch these into few requests instead of one round trip per row. */
  bulkCreateEmployees(inputs: EmployeeInput[]): Promise<EmployeeRecord[]>;
  updateEmployee(recordId: string, input: EmployeeInput): Promise<EmployeeRecord>;
  deactivateEmployee(recordId: string): Promise<EmployeeRecord>;
  /** Permanently removes an employee record — irreversible, unlike deactivateEmployee's soft-delete. */
  deleteEmployee(recordId: string): Promise<void>;
  getDashboardStats(): Promise<DashboardStats>;

  // Contract history — probation/contract periods per employee, unlimited
  // length (unlike the legacy fixed CONTRACT CLOSE-FIRST..FIVETH columns).
  getContractHistory(employeeId: string): Promise<ContractHistoryEntry[]>;
  createContractHistoryEntry(employeeId: string, input: ContractHistoryInput): Promise<ContractHistoryEntry>;
  updateContractHistoryEntry(id: string, input: ContractHistoryInput): Promise<ContractHistoryEntry>;
  deleteContractHistoryEntry(id: string): Promise<void>;
  /** Every employee's most recent (latest end date) contract_history period — used by the Dashboard's "contract ending soon" cards. Keyed by employee record_id. */
  getLatestContractEndDates(): Promise<Record<string, string>>;
  getContractEndDates(): Promise<Record<string, string[]>>;

  // Master data — simple categories (Departments, Positions, Levels, Skills, Bank)
  getSimpleMasterData(
    category: SimpleMasterCategory,
    options?: { activeOnly?: boolean },
  ): Promise<MasterDataItem[]>;
  createSimpleMasterDataItem(
    category: SimpleMasterCategory,
    input: CreateMasterDataInput,
  ): Promise<MasterDataItem>;
  updateSimpleMasterDataItem(
    category: SimpleMasterCategory,
    id: string,
    input: UpdateMasterDataInput,
  ): Promise<MasterDataItem>;
  toggleSimpleMasterDataStatus(category: SimpleMasterCategory, id: string): Promise<MasterDataItem>;

  // Master data — Lookup (Category, Type, Shed, Gender, Religion, ...)
  getLookup(type: string, options?: { activeOnly?: boolean }): Promise<LookupItem[]>;
  getAllLookup(): Promise<Record<string, LookupItem[]>>;
  getAllLookupIncludingInactive(): Promise<Record<string, LookupItem[]>>;
  createLookupItem(input: CreateLookupInput): Promise<LookupItem>;
  updateLookupItem(id: string, input: UpdateLookupInput): Promise<LookupItem>;
  toggleLookupStatus(id: string): Promise<LookupItem>;

  getAllMasterData(): Promise<AllMasterData>;
}
