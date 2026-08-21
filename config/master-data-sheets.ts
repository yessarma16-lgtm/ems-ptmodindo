import { EMPLOYEES_SHEET_HEADERS } from "@/config/employee-fields";

/**
 * Structure definitions for the supporting Google Sheets that make up the
 * Employee Database, beyond the `Employees` sheet itself (config/employee-fields.ts).
 *
 * Simple master data sheets (Departments, Positions, Levels, Skills, Bank)
 * all share the same shape: ID | CODE | NAME | STATUS | SORT_ORDER.
 *
 * `Lookup` holds every small enumerated dropdown (gender, religion,
 * marital status, ...) in one sheet, disambiguated by a TYPE column:
 * ID | TYPE | CODE | NAME | STATUS | SORT_ORDER.
 *
 * `Contract_History`, `Family`, `BPJS`, `Settings`, `Audit_Log` are prepared
 * with their header row only in STEP 2 — no CRUD UI is built for them yet,
 * they are structural groundwork for future phases.
 */

export const SIMPLE_MASTER_SHEETS = {
  departments: "Departments",
  positions: "Positions",
  levels: "Levels",
  skills: "Skills",
  banks: "Bank",
} as const;

export type SimpleMasterCategory = keyof typeof SIMPLE_MASTER_SHEETS;

export const SIMPLE_MASTER_HEADERS = ["ID", "CODE", "NAME", "STATUS", "SORT_ORDER"];
export const SIMPLE_MASTER_LAST_COLUMN = "E";

export const LOOKUP_SHEET_NAME = "Lookup";
export const LOOKUP_HEADERS = ["ID", "TYPE", "CODE", "NAME", "STATUS", "SORT_ORDER"];
export const LOOKUP_LAST_COLUMN = "F";

/**
 * Every small enumerated dropdown in the Employee Form that is backed by
 * the `Lookup` sheet, keyed by TYPE. `label` is only used for the Master
 * Data admin UI's "Type" selector — never written to the sheet.
 */
export const LOOKUP_TYPES = [
  { type: "CATEGORY", label: "Category" },
  { type: "TYPE", label: "Employee Type" },
  { type: "SHED", label: "Shed (Work Schedule)" },
  { type: "CONTRACT_STATUS", label: "Contract Status" },
  { type: "CONTRACT_CRITERIA", label: "Contract Criteria" },
  { type: "MARITAL_STATUS", label: "Marital Status" },
  { type: "GENDER", label: "Gender" },
  { type: "PTKP", label: "PTKP Status" },
  { type: "EDUCATION", label: "Education" },
  { type: "RELIGION", label: "Religion" },
  { type: "EMPLOYEE_STATUS", label: "Employee Status" },
  { type: "BPJS_KTK", label: "BPJS Ketenagakerjaan Status" },
  { type: "BPJS_KES", label: "BPJS Kesehatan Status" },
  { type: "SERAGAM", label: "Seragam (Uniform Size)" },
  { type: "BLOOD_TYPE", label: "Blood Type" },
] as const;

export type LookupType = (typeof LOOKUP_TYPES)[number]["type"];

export const SETTINGS_SHEET_NAME = "Settings";

/**
 * Users — Login / User Management (Settings -> User Management), the
 * Google Sheets equivalent of the SQLite `users` table. `ID` is a
 * sequential numeric string (same nextNumericId() scheme as
 * Departments/Positions) — it's what session tokens embed and what
 * /api/users/[id] uses, so it must behave identically to SQLite's
 * autoincrement id regardless of provider.
 */
export const USERS_SHEET_NAME = "Users";
export const USERS_SHEET_HEADERS = [
  "ID",
  "RECORD_ID",
  "NAME",
  "USERNAME",
  "EMAIL",
  "ROLE",
  "STATUS",
  "PASSWORD_HASH",
  "PASSWORD_SALT",
  "CREATED_AT",
  "UPDATED_AT",
];
export const USERS_LAST_COLUMN = "K";

/**
 * Role_Permissions — per-role module access (Settings -> User Management ->
 * Role Access). One row per role in config/user-roles.ts, disambiguated by
 * the ROLE column — same "one sheet, one key column" shape as `Lookup`.
 */
export const ROLE_PERMISSIONS_SHEET_NAME = "Role_Permissions";
export const ROLE_PERMISSIONS_SHEET_HEADERS = ["ROLE", "PERMISSIONS", "UPDATED_AT"];
export const ROLE_PERMISSIONS_LAST_COLUMN = "C";

/**
 * Online_Registrations — Recruitment candidate drafts, shaped exactly like
 * `Employees` (see google-sheets-online-registrations.ts) plus 3 trailing
 * columns.
 */
export const ONLINE_REGISTRATIONS_SHEET_NAME = "Online_Registrations";
export const ONLINE_REGISTRATIONS_EXTRA_HEADERS = ["REGISTRATION_STATUS", "SOURCE_PLATFORM", "SUBMITTED_AT"];
export const ONLINE_REGISTRATIONS_SHEET_HEADERS = [...EMPLOYEES_SHEET_HEADERS, ...ONLINE_REGISTRATIONS_EXTRA_HEADERS];
export const ONLINE_REGISTRATIONS_LAST_COLUMN = "BL";

/** Sheets prepared with a header row only — no CRUD service/UI in STEP 2 (Settings and Online_Registrations gained real read/write later — see lib/database/google-sheets-settings.ts and google-sheets-online-registrations.ts). */
export const SUPPORTING_SHEET_HEADERS: Record<string, string[]> = {
  Contract_History: [
    "RECORD_ID",
    "EMPLOYEE_ID",
    "CONTRACT_TYPE",
    "CONTRACT_START",
    "CONTRACT_END",
    "STATUS",
    "CREATED_AT",
    "UPDATED_AT",
  ],
  Family: ["RECORD_ID", "EMPLOYEE_ID", "RELATIONSHIP", "NAME", "STATUS", "CREATED_AT", "UPDATED_AT"],
  BPJS: ["RECORD_ID", "EMPLOYEE_ID", "TYPE", "NUMBER", "STATUS", "CREATED_AT", "UPDATED_AT"],
  [SETTINGS_SHEET_NAME]: ["KEY", "VALUE", "DESCRIPTION", "UPDATED_AT"],
  Audit_Log: ["RECORD_ID", "ACTION", "ENTITY", "ENTITY_ID", "DETAIL", "CREATED_AT", "USER"],
  [ONLINE_REGISTRATIONS_SHEET_NAME]: ONLINE_REGISTRATIONS_SHEET_HEADERS,
};
