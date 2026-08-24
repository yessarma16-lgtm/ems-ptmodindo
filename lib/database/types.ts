/**
 * Shared data types for the Database Adapter layer. Provider-agnostic — the
 * SQLite adapter and the Google Sheets adapter both produce/consume exactly
 * these shapes, so the rest of the app (UI, API routes, employee-service.ts,
 * master-data-service.ts) never needs to know which provider is active.
 */

export interface EmployeeRecord {
  recordId: string;
  createdAt: string;
  updatedAt: string;
  [fieldKey: string]: string;
}

/** Input shape accepted from the validated Employee form (all editable field keys -> string). */
export type EmployeeInput = Record<string, string>;

export type ApplicantAccessChannel = "applicant_pool_qr" | "new_hiring_qr_nik" | "new_hiring_link";
export type NewHiringLinkStatus = "active" | "used" | "expired" | "revoked";

export interface ApplicantPreviousJob {
  id: string;
  applicantId: string;
  companyName: string;
  startYear: number;
  endYear: number | null;
  lastPosition: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCheckResult {
  nik: string;
  foundIn: "employees" | "online_registrations" | "none";
  checkedAt: string;
}

/**
 * The handful of fields the Active/Inactive/Expatriate list tables actually
 * display (or filter by) — used instead of the full ~58-field
 * `EmployeeRecord` for list views. With thousands of employees, sending
 * every field for every row (most never rendered in the table) made the
 * page noticeably slower to load; this cuts the payload by roughly 80%.
 * Full records are still fetched normally for the single-employee detail/edit
 * pages via `getEmployeeById`.
 */
export interface EmployeeListItem {
  recordId: string;
  nik: string;
  name: string;
  department: string;
  position: string;
  level: string;
  type: string;
  category: string;
  joinDate: string;
  exitDate: string;
  contractStatus: string;
  status: string;
  interviewEvaluation: string;
}

/** Which employee list a query is for — maps to the STATUS/CATEGORY filters isActiveEmployee/isInactiveEmployee/isExpatriateEmployee used to apply client-side. */
export type EmployeeListScope = "active" | "inactive" | "expatriate";

export type EmployeeSortKey = "name" | "department" | "joinDate" | "exitDate";

/**
 * Search/filter/sort/pagination performed server-side (in the database
 * query itself) instead of "fetch every row, then filter/sort/paginate in
 * the browser" — the latter meant every page load moved the full employee
 * table over the network regardless of how many rows were actually shown.
 */
export interface EmployeeListQuery {
  scope: EmployeeListScope;
  search: string;
  department: string;
  status: string;
  contractStatus: string;
  /** Filters by JOIN DATE on "active"/"expatriate" scope, EXIT DATE on "inactive" scope. Empty string = no bound. */
  dateFrom: string;
  dateTo: string;
  sortKey: EmployeeSortKey;
  sortAsc: boolean;
  page: number;
  pageSize: number;
}

export interface EmployeeListPage {
  items: EmployeeListItem[];
  total: number;
}

/**
 * One probation/contract period for an employee, stored in the
 * `contract_history` table — a separate, unlimited-length list per employee
 * rather than a fixed set of columns, so it can grow across renewals over
 * the years and be queried directly for dashboard reporting (e.g. contracts
 * expiring this month).
 */
export interface ContractHistoryEntry {
  id: string;
  employeeId: string;
  contractType: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractHistoryInput {
  contractType: string;
  startDate: string;
  endDate: string;
}

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  contractEmployees: number;
  permanentEmployees: number;
  newEmployees: number;
  exitedEmployees: number;
}

export interface MasterDataItem {
  id: string;
  code: string;
  name: string;
  status: string;
  sortOrder: number;
}

export interface LookupItem extends MasterDataItem {
  type: string;
}

export interface CreateMasterDataInput {
  code: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateMasterDataInput {
  code?: string;
  name?: string;
  status?: string;
  sortOrder?: number;
}

export interface CreateLookupInput {
  type: string;
  code: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateLookupInput {
  code?: string;
  name?: string;
  status?: string;
  sortOrder?: number;
}

export interface AllMasterData {
  departments: MasterDataItem[];
  positions: MasterDataItem[];
  levels: MasterDataItem[];
  skills: MasterDataItem[];
  banks: MasterDataItem[];
  vacantPositions: MasterDataItem[];
  lookup: Record<string, LookupItem[]>;
}
