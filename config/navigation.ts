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
  // Modul Attendance/Overtime (docs/ATTENDANCE_OVERTIME_MODULE_SPEC.md).
  // Cuma 1 child sekarang karena cuma Page 1 yang sudah dibangun (langkah 5)
  // -- MPP Calculation & Overtime Report ditambah sebagai child di sini
  // begitu halamannya masing-masing dibuat (langkah 6-7), jangan link ke
  // route yang belum ada.
  { label: "Attendance", href: "/attendance/import", icon: ClipboardCheck },
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
