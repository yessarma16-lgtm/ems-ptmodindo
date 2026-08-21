/**
 * Per-module access level a Role can be assigned in Settings -> User
 * Management -> Role Access. Scaffold only, like the rest of User
 * Management: stored data, not enforced anywhere in the app yet (no page
 * actually checks these values before rendering).
 */
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employeesActive", label: "Employees - Active" },
  { key: "employeesInactive", label: "Employees - Inactive" },
  { key: "employeesExpatriate", label: "Employees - Expatriate" },
  { key: "onlineRegister", label: "Recruitment - Online Register" },
  { key: "attendanceImport", label: "Attendance - NK Attendance Data" },
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
