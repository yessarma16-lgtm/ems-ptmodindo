import "server-only";

import { getEmployeeListItems, getLatestContractEndDates } from "@/lib/employee-service";
import type { EmployeeListItem } from "@/lib/database/types";

/** Company data starts in 2017 — years before that are excluded from both the year filter and the per-year charts. */
const MIN_YEAR = 2017;

export interface DashboardFilter {
  /** "1".."12", or "" for the whole year. */
  month: string;
  /** e.g. "2026", or "" for All Years. */
  year: string;
}

export interface DashboardCards {
  activeEmployees: number;
  newEmployees: number;
  resignedEmployees: number;
  endingThisMonth: number;
  endingNextMonth: number;
  endingNext2Months: number;
}

export interface MonthPoint {
  month: string;
  joined: number;
  resigned: number;
}

export interface MonthlyHeadcountPoint {
  month: string;
  active: number;
  inactive: number;
}

export interface ContractTypeMonthPoint {
  month: string;
  permanentProbation: number;
  contract: number;
}

export interface CountPoint {
  label: string;
  count: number;
}

export interface DashboardData {
  cards: DashboardCards;
  newVsResignByMonth: MonthPoint[];
  monthlyHeadcount: MonthlyHeadcountPoint[];
  contractTypeByMonth: ContractTypeMonthPoint[];
  topDepartments: CountPoint[];
  employeeTypes: CountPoint[];
  availableYears: string[];
}

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isInactive(status: string): boolean {
  return (status || "").trim().toLowerCase() === "inactive";
}

function yearOf(dateStr: string): string {
  return (dateStr || "").slice(0, 4);
}

/** ISO YYYY-MM-DD for the given UTC calendar month/year, day 1. Months are 1-indexed and may go outside 1-12 (e.g. 13 rolls to next year). */
function monthStart(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1 - 1, 1));
  return d.toISOString().slice(0, 10);
}

/** Last day of the given UTC calendar month/year. */
function monthEnd(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0));
  return d.toISOString().slice(0, 10);
}

export function parseDashboardFilter(searchParams: Record<string, string | string[] | undefined>): DashboardFilter {
  const get = (key: string): string => {
    const v = searchParams[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const yearRaw = get("year");
  const currentYear = new Date().getFullYear();
  const year = yearRaw === "all" ? "" : /^\d{4}$/.test(yearRaw) ? yearRaw : String(currentYear);
  const monthRaw = get("month");
  const month = /^([1-9]|1[0-2])$/.test(monthRaw) ? monthRaw : "";
  return { month, year };
}

export async function loadDashboardData(filter: DashboardFilter): Promise<DashboardData> {
  const [items, latestContractEnd] = await Promise.all([getEmployeeListItems(), getLatestContractEndDates()]);

  const activeYear = Number(filter.year) || new Date().getFullYear();

  const cards = computeCards(items, latestContractEnd, filter);
  const newVsResignByMonth = computeNewVsResignByMonth(items, activeYear);
  const monthlyHeadcount = computeMonthlyHeadcount(items, activeYear);
  const contractTypeByMonth = computeContractTypeByMonth(items, activeYear);
  const topDepartments = computeTopDepartments(items, filter);
  const employeeTypes = computeEmployeeTypes(items);

  const yearsFromData = new Set<string>();
  for (const e of items) {
    const y = yearOf(e.joinDate);
    if (y && Number(y) >= MIN_YEAR) yearsFromData.add(y);
  }
  yearsFromData.add(String(new Date().getFullYear()));
  const availableYears = Array.from(yearsFromData).sort((a, b) => Number(b) - Number(a));

  return { cards, newVsResignByMonth, monthlyHeadcount, contractTypeByMonth, topDepartments, employeeTypes, availableYears };
}

/** True if dateStr falls within the filter's year (when set) and month (when set) — "" for either means "any". */
function inPeriod(dateStr: string, filter: DashboardFilter): boolean {
  if (!dateStr) return false;
  if (filter.year && yearOf(dateStr) !== filter.year) return false;
  if (!filter.month) return true;
  const m = dateStr.slice(5, 7);
  return Number(m) === Number(filter.month);
}

function computeCards(
  items: EmployeeListItem[],
  latestContractEnd: Record<string, string>,
  filter: DashboardFilter,
): DashboardCards {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-indexed current month

  const thisMonthStart = monthStart(y, m);
  const thisMonthEnd = monthEnd(y, m);
  const nextMonthStart = monthStart(y, m + 1);
  const nextMonthEnd = monthEnd(y, m + 1);
  const twoMonthsEnd = monthEnd(y, m + 2);
  const today = now.toISOString().slice(0, 10);

  let active = 0;
  let newEmployees = 0;
  let resigned = 0;
  let endingThisMonth = 0;
  let endingNextMonth = 0;
  let endingNext2Months = 0;

  for (const e of items) {
    const inactive = isInactive(e.status);
    if (!inactive) active++;

    if (inPeriod(e.joinDate, filter)) newEmployees++;
    if (e.exitDate && inPeriod(e.exitDate, filter)) resigned++;

    if (!inactive) {
      const end = latestContractEnd[e.recordId];
      if (end) {
        if (end >= thisMonthStart && end <= thisMonthEnd) endingThisMonth++;
        if (end >= nextMonthStart && end <= nextMonthEnd) endingNextMonth++;
        if (end >= today && end <= twoMonthsEnd) endingNext2Months++;
      }
    }
  }

  return {
    activeEmployees: active,
    newEmployees,
    resignedEmployees: resigned,
    endingThisMonth,
    endingNextMonth,
    endingNext2Months,
  };
}

function computeNewVsResignByMonth(items: EmployeeListItem[], year: number): MonthPoint[] {
  const joined = new Array(12).fill(0);
  const resigned = new Array(12).fill(0);
  for (const e of items) {
    if (yearOf(e.joinDate) === String(year)) joined[Number(e.joinDate.slice(5, 7)) - 1]++;
    if (yearOf(e.exitDate) === String(year)) resigned[Number(e.exitDate.slice(5, 7)) - 1]++;
  }
  return MONTH_NAMES_SHORT.map((month, i) => ({ month, joined: joined[i], resigned: resigned[i] }));
}

function computeMonthlyHeadcount(items: EmployeeListItem[], year: number): MonthlyHeadcountPoint[] {
  const points: MonthlyHeadcountPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const end = monthEnd(year, m);
    let active = 0;
    let inactive = 0;
    for (const e of items) {
      if (!e.joinDate || e.joinDate > end) continue;
      const hasExited = !!e.exitDate && e.exitDate <= end;
      if (hasExited) inactive++;
      else active++;
    }
    points.push({ month: MONTH_NAMES_SHORT[m - 1], active, inactive });
  }
  return points;
}

function computeContractTypeByMonth(items: EmployeeListItem[], year: number): ContractTypeMonthPoint[] {
  const permanentProbation = new Array(12).fill(0);
  const contract = new Array(12).fill(0);
  for (const e of items) {
    if (yearOf(e.joinDate) !== String(year)) continue;
    const m = Number(e.joinDate.slice(5, 7)) - 1;
    const status = (e.contractStatus || "").trim().toLowerCase();
    if (status === "permanent" || status === "probation") permanentProbation[m]++;
    else if (status === "contract") contract[m]++;
  }
  return MONTH_NAMES_SHORT.map((month, i) => ({ month, permanentProbation: permanentProbation[i], contract: contract[i] }));
}

/** Department headcount as of the end of the filtered period (month+year, or year-end, or today if no filter) — not just "right now". */
function computeTopDepartments(items: EmployeeListItem[], filter: DashboardFilter): CountPoint[] {
  const asOf = filter.year
    ? filter.month
      ? monthEnd(Number(filter.year), Number(filter.month))
      : monthEnd(Number(filter.year), 12)
    : new Date().toISOString().slice(0, 10);

  const counts = new Map<string, number>();
  for (const e of items) {
    if (!e.joinDate || e.joinDate > asOf) continue;
    const hasExited = !!e.exitDate && e.exitDate <= asOf;
    if (hasExited) continue;
    const dept = e.department || "(None)";
    counts.set(dept, (counts.get(dept) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function computeEmployeeTypes(items: EmployeeListItem[]): CountPoint[] {
  const counts = new Map<string, number>();
  for (const e of items) {
    if (isInactive(e.status)) continue;
    const type = e.type || "(None)";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
