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

export interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
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
    collapsible: true,
    children: [
      { label: "Active Employees", href: "/employees", icon: UserCheck },
      { label: "Inactive Employees", href: "/employees/inactive", icon: UserX },
      { label: "Expatriate", href: "/employees/expatriate", icon: Globe2 },
    ],
  },
  {
    label: "Recruitment", href: "/recruitment", icon: UserPlus, collapsible: true,
    children: [
      { label: "New Hiring", href: "/recruitment/new-hiring", icon: UserPlus },
      { label: "Applicant Pool", href: "/recruitment/applicant-pool", icon: UsersRound },
      { label: "Vacant Position", href: "/recruitment/vacant-position", icon: Briefcase },
    ],
  },
  {
    label: "Attendance",
    href: "/attendance/import",
    icon: ClipboardCheck,
    collapsible: true,
    children: [
      { label: "NK Attendance Data", href: "/attendance/import", icon: FileClock },
      { label: "MPP Calculation", href: "/attendance/calculation", icon: Calculator },
      { label: "Overtime Report", href: "/attendance/report", icon: TimerReset },
    ],
  },
  {
    label: "Report",
    href: "/reports",
    icon: FileBarChart2,
    collapsible: true,
    children: [
      { label: "Employee Report", href: "/reports/employee", icon: FileBarChart2 },
      { label: "Report Mangkir", href: "/reports/mangkir", icon: AlertTriangle },
      { label: "OT Planning", href: "/reports/ot-planning", icon: TimerReset },
      { label: "Report Setup", href: "/reports/setup", icon: SlidersHorizontal },
    ],
  },
  { label: "Export", href: "/export", icon: FileSpreadsheet },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings2,
    collapsible: true,
    children: [
      { label: "Database", href: "/settings", icon: Database },
      { label: "My Profile", href: "/settings/profile", icon: UserRound },
      { label: "Master Data", href: "/settings/master-data", icon: ListTree },
      { label: "User Management", href: "/settings/users", icon: Users },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [];
