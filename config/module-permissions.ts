/**
 * Per-module access level a Role can be assigned in Settings -> User
 * Management -> Role Access. The list mirrors the sidebar (config/navigation.ts).
 *
 * Enforcement today is at the API-route layer via requireModuleAccess()
 * (lib/module-permission.ts) — wired for the Attendance, Report and
 * Recruitment routes. The remaining entries (Dashboard, Employees, Export,
 * Master Data, Settings) are still scaffold: shown and stored, not yet
 * checked before rendering.
 */
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employeesActive", label: "Employees - Active" },
  { key: "employeesInactive", label: "Employees - Inactive" },
  { key: "employeesExpatriate", label: "Employees - Expatriate" },
  { key: "recruitmentNewHiring", label: "Recruitment - New Hiring" },
  { key: "recruitmentApplicantPool", label: "Recruitment - Applicant Pool" },
  { key: "recruitmentVacantPosition", label: "Recruitment - Vacant Position" },
  { key: "attendanceImport", label: "Attendance - NK Attendance Data" },
  { key: "attendanceCalculation", label: "Attendance - MPP Calculation" },
  { key: "attendanceReport", label: "Attendance - Overtime Report" },
  { key: "reportEmployee", label: "Report - Employee Report" },
  { key: "reportHr", label: "Report - HR Report Center" },
  { key: "reportOverdueEmployee", label: "Report - Overdue Employee" },
  { key: "reportMangkir", label: "Report - Report Mangkir" },
  { key: "reportOtPlanning", label: "Report - OT Planning" },
  { key: "reportSetup", label: "Report - Report Setup" },
  { key: "export", label: "Export" },
  { key: "masterData", label: "Master Data" },
  { key: "settingsDatabase", label: "Settings - Database" },
  { key: "myProfile", label: "Settings - My Profile" },
  { key: "userManagement", label: "Settings - User Management" },
] as const;

export type ModuleKey = (typeof PERMISSION_MODULES)[number]["key"];
/** "hidden" = the page can't be seen at all; "view" = read-only; "edit" = full access. */
export type AccessLevel = "edit" | "view" | "hidden";
export type ModulePermissions = Record<ModuleKey, AccessLevel>;

export function defaultModulePermissions(): ModulePermissions {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, "edit" as AccessLevel])) as ModulePermissions;
}

/** Every module set to "hidden" — the safe fallback when a user's role has no permissions row. */
export function allHiddenModulePermissions(): ModulePermissions {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, "hidden" as AccessLevel])) as ModulePermissions;
}

/**
 * Keeps ONLY the module keys explicitly present with a valid level — no
 * default fill. Used for per-user Individual Access overrides, which layer on
 * top of the role's permissions (a key absent here means "inherit from role").
 */
export function sanitizePartialPermissions(value: Partial<Record<string, unknown>> | undefined | null): Partial<ModulePermissions> {
  const result: Partial<ModulePermissions> = {};
  if (!value) return result;
  for (const { key } of PERMISSION_MODULES) {
    const level = value[key];
    if (level === "edit" || level === "view" || level === "hidden") result[key] = level;
  }
  return result;
}

/** Fills in any missing module keys with "edit" — keeps old/short-hand records usable after this list grows. */
export function normalizeModulePermissions(value: Partial<ModulePermissions> | undefined | null): ModulePermissions {
  const defaults = defaultModulePermissions();
  if (!value) return defaults;
  const result = { ...defaults };
  for (const { key } of PERMISSION_MODULES) {
    if (value[key] === "edit" || value[key] === "view" || value[key] === "hidden") {
      result[key] = value[key];
    }
  }
  return result;
}
