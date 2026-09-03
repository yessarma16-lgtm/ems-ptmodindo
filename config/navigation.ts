import {
  LayoutDashboard,
  UsersRound,
  UserPlus,
  FileBarChart2,
  FileSpreadsheet,
  Settings2,
  ClipboardCheck,
  UserCheck,
  UserX,
  Globe2,
  FileClock,
  Calculator,
  TimerReset,
  AlertTriangle,
  SlidersHorizontal,
  Database,
  UserRound,
  ListTree,
  Users,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/config/module-permissions";

export interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
  moduleKey?: ModuleKey;
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Sub-views nested under this item in the sidebar (e.g. Employees -> Active/Inactive/...). */
  children?: NavChild[];
  moduleKey?: ModuleKey;
  /**
   * When true, the parent row is a pure open/close toggle (children hidden
   * until clicked) instead of also being a navigable link. When false/unset,
   * the parent still navigates to `href` and children are always shown.
   */
  collapsible?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, moduleKey: "dashboard" },
  {
    label: "Employees",
    href: "/employees",
    icon: UsersRound,
    collapsible: true,
    children: [
      { label: "Active Employees", href: "/employees", icon: UserCheck, moduleKey: "employeesActive" },
      { label: "Inactive Employees", href: "/employees/inactive", icon: UserX, moduleKey: "employeesInactive" },
      { label: "Expatriate", href: "/employees/expatriate", icon: Globe2, moduleKey: "employeesExpatriate" },
    ],
  },
  {
    label: "Recruitment", href: "/recruitment", icon: UserPlus, collapsible: true,
    children: [
      { label: "New Hiring", href: "/recruitment/new-hiring", icon: UserPlus, moduleKey: "recruitmentNewHiring" },
      { label: "Applicant Pool", href: "/recruitment/applicant-pool", icon: UsersRound, moduleKey: "recruitmentApplicantPool" },
      { label: "Vacant Position", href: "/recruitment/vacant-position", icon: Briefcase, moduleKey: "recruitmentVacantPosition" },
    ],
  },
  {
    label: "Attendance",
    href: "/attendance/import",
    icon: ClipboardCheck,
    collapsible: true,
    children: [
      { label: "NK Attendance Data", href: "/attendance/import", icon: FileClock, moduleKey: "attendanceImport" },
      { label: "MPP Calculation", href: "/attendance/calculation", icon: Calculator, moduleKey: "attendanceCalculation" },
      { label: "Overtime Report", href: "/attendance/report", icon: TimerReset, moduleKey: "attendanceReport" },
    ],
  },
  {
    label: "Report",
    href: "/reports",
    icon: FileBarChart2,
    collapsible: true,
    children: [
      { label: "Employee Report", href: "/reports/employee", icon: FileBarChart2, moduleKey: "reportEmployee" },
      { label: "Report Mangkir", href: "/reports/mangkir", icon: AlertTriangle, moduleKey: "reportMangkir" },
      { label: "OT Planning", href: "/reports/ot-planning", icon: TimerReset, moduleKey: "reportOtPlanning" },
      { label: "Report Setup", href: "/reports/setup", icon: SlidersHorizontal, moduleKey: "reportSetup" },
    ],
  },
  { label: "Export", href: "/export", icon: FileSpreadsheet, moduleKey: "export" },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings2,
    collapsible: true,
    children: [
      { label: "Database", href: "/settings", icon: Database, moduleKey: "settingsDatabase" },
      { label: "My Profile", href: "/settings/profile", icon: UserRound, moduleKey: "myProfile" },
      { label: "Master Data", href: "/settings/master-data", icon: ListTree, moduleKey: "masterData" },
      { label: "User Management", href: "/settings/users", icon: Users, moduleKey: "userManagement" },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [];
