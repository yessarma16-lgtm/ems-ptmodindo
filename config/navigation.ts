import {
  LayoutDashboard,
  UsersRound,
  UserPlus,
  FileBarChart2,
  FileSpreadsheet,
  Settings2,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Sub-views nested under this item in the sidebar (e.g. Employees -> Active/Inactive/...). */
  children?: NavChild[];
  /**
   * When true, the parent row is a pure open/close toggle (children hidden
   * until clicked) instead of also being a navigable link. When false/unset,
   * the parent still navigates to `href` and children are always shown.
   */
  collapsible?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Employees",
    href: "/employees",
    icon: UsersRound,
    children: [
      { label: "Active Employees", href: "/employees" },
      { label: "Inactive Employees", href: "/employees/inactive" },
      { label: "Expatriate", href: "/employees/expatriate" },
    ],
  },
  { label: "Recruitment", href: "/recruitment", icon: UserPlus },
  {
    label: "Attendance",
    href: "/attendance/import",
    icon: ClipboardCheck,
    children: [
      { label: "NK Attendance Data", href: "/attendance/import" },
      { label: "MPP Calculation", href: "/attendance/calculation" },
    ],
  },
  {
    label: "Report",
    href: "/reports/employee",
    icon: FileBarChart2,
    children: [{ label: "Employee Report", href: "/reports/employee" }],
  },
  { label: "Export", href: "/export", icon: FileSpreadsheet },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings2,
    collapsible: true,
    children: [
      { label: "Database", href: "/settings" },
      { label: "My Profile", href: "/settings/profile" },
      { label: "Master Data", href: "/settings/master-data" },
      { label: "User Management", href: "/settings/users" },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [];
