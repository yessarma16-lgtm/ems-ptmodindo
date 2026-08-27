import "server-only";

import { getContractEndDates, getEmployeeListItems, getLatestContractEndDates } from "@/lib/employee-service";
import { getOnlineRegistrations, type OnlineRegistration } from "@/lib/online-register-service";
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
  endingThisMonthEmployees: ContractEndingEmployee[];
  endingNextMonthEmployees: ContractEndingEmployee[];
  endingNext2MonthsEmployees: ContractEndingEmployee[];
}

export interface ContractEndingEmployee {
  recordId: string;
  name: string;
  department: string;
  endDate: string;
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

export interface ResignBreakdownMonthPoint {
  month: string;
  [seriesKey: string]: string | number;
}

export interface ResignBreakdownData {
  points: ResignBreakdownMonthPoint[];
  /** Ordered series keys present in `points` — drives which lines render and their legend/color order. */
  series: string[];
}

export interface CountPoint {
  label: string;
  count: number;
}

/**
 * Walk-in applicants (Applicant Pool QR), bucketed by the month they applied
 * (submittedAt) and split by their CURRENT stage — not by whichever pool they
 * originally landed in, since a candidate can advance from Applicant Pool to
 * New Hiring (see promoteRegistrationToNewHiring) or all the way to Approved
 * without ever losing their `sourcePlatform: "walkin"` origin tag.
 */
export interface WalkinApplicantsMonthPoint {
  month: string;
  applicantPool: number;
  newHiring: number;
  approved: number;
  rejected: number;
}

export interface DashboardData {
  cards: DashboardCards;
  newVsResignByMonth: MonthPoint[];
  monthlyHeadcount: MonthlyHeadcountPoint[];
  /** Keyed by year string (e.g. "2026") — one entry per year in `availableYears`. */
  resignBreakdownByYear: Record<string, { byDepartment: ResignBreakdownData; byMaritalStatus: ResignBreakdownData }>;
  /** Year ResignLineChart's own selector starts on — the page-wide filter's year, or the current year. */
  defaultResignYear: string;
  walkinApplicantsByMonth: WalkinApplicantsMonthPoint[];
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
  const [items, latestContractEnd, contractEnds, registrations] = await Promise.all([
    getEmployeeListItems(),
    getLatestContractEndDates(),
    getContractEndDates(),
    getOnlineRegistrations(),
  ]);

  const activeYear = Number(filter.year) || new Date().getFullYear();

  const cards = computeCards(items, latestContractEnd, contractEnds, filter);
  const newVsResignByMonth = computeNewVsResignByMonth(items, activeYear);
  const monthlyHeadcount = computeMonthlyHeadcount(items, activeYear);
  const walkinApplicantsByMonth = computeWalkinApplicantsByMonth(registrations, activeYear);
  const topDepartments = computeTopDepartments(items, filter);
  const employeeTypes = computeEmployeeTypes(items);

  // Exit Date years are unioned in too (not just Join Date), so a resignation
  // in a year nobody joined in still gets a year option in ResignLineChart's
  // own selector.
  const yearsFromData = new Set<string>();
  for (const e of items) {
    const jy = yearOf(e.joinDate);
    if (jy && Number(jy) >= MIN_YEAR) yearsFromData.add(jy);
    const ey = yearOf(e.exitDate);
    if (ey && Number(ey) >= MIN_YEAR) yearsFromData.add(ey);
  }
  yearsFromData.add(String(new Date().getFullYear()));
  const availableYears = Array.from(yearsFromData).sort((a, b) => Number(b) - Number(a));

  // Resignations by Department/Marital Status are computed for every
  // available year up front — ResignLineChart switches between them
  // entirely client-side (its own year selector, independent of the
  // page-wide filter above) since this dataset is small.
  const resignBreakdownByYear: Record<string, { byDepartment: ResignBreakdownData; byMaritalStatus: ResignBreakdownData }> = {};
  for (const y of availableYears) {
    resignBreakdownByYear[y] = {
      byDepartment: computeResignBreakdown(items, Number(y), (e) => e.department, topNSeries(5)),
      byMaritalStatus: computeResignBreakdown(items, Number(y), (e) => e.maritalStatus, fixedSeries(MARITAL_STATUS_SERIES)),
    };
  }

  return {
    cards,
    newVsResignByMonth,
    monthlyHeadcount,
    resignBreakdownByYear,
    defaultResignYear: String(activeYear),
    walkinApplicantsByMonth,
    topDepartments,
    employeeTypes,
    availableYears,
  };
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
  contractEnds: Record<string, string[]>,
  filter: DashboardFilter,
): DashboardCards {
  const now = new Date();
  const y = filter.month && filter.year ? Number(filter.year) : now.getUTCFullYear();
  const m = filter.month ? Number(filter.month) : now.getUTCMonth() + 1; // 1-indexed

  const thisMonthStart = monthStart(y, m);
  const thisMonthEnd = monthEnd(y, m);
  const nextMonthStart = monthStart(y, m + 1);
  const nextMonthEnd = monthEnd(y, m + 1);
  const twoMonthsStart = monthStart(y, m + 2);
  const twoMonthsEnd = monthEnd(y, m + 2);

  let active = 0;
  let newEmployees = 0;
  let resigned = 0;
  let endingThisMonth = 0;
  let endingNextMonth = 0;
  let endingNext2Months = 0;
  const endingThisMonthEmployees: ContractEndingEmployee[] = [];
  const endingNextMonthEmployees: ContractEndingEmployee[] = [];
  const endingNext2MonthsEmployees: ContractEndingEmployee[] = [];

  for (const e of items) {
    const inactive = isInactive(e.status);
    if (!inactive) active++;

    if (inPeriod(e.joinDate, filter)) newEmployees++;
    if (e.exitDate && inPeriod(e.exitDate, filter)) resigned++;

    if (!inactive) {
      // Keep historical contract dates available when a past month is selected.
      const ends = contractEnds[e.recordId] ?? (latestContractEnd[e.recordId] ? [latestContractEnd[e.recordId]] : []);
      for (const end of ends) {
        const employee = {
          recordId: e.recordId,
          name: e.name || e.nik || "Unnamed employee",
          department: e.department || "No department",
          endDate: end,
        };
        if (end >= thisMonthStart && end <= thisMonthEnd) {
          endingThisMonth++;
          endingThisMonthEmployees.push(employee);
        }
        if (end >= nextMonthStart && end <= nextMonthEnd) {
          endingNextMonth++;
          endingNextMonthEmployees.push(employee);
        }
        if (end >= twoMonthsStart && end <= twoMonthsEnd) {
          endingNext2Months++;
          endingNext2MonthsEmployees.push(employee);
        }
      }
    }
  }

  const sortByEndDate = (a: ContractEndingEmployee, b: ContractEndingEmployee) =>
    a.endDate.localeCompare(b.endDate);
  endingThisMonthEmployees.sort(sortByEndDate);
  endingNextMonthEmployees.sort(sortByEndDate);
  endingNext2MonthsEmployees.sort(sortByEndDate);

  return {
    activeEmployees: active,
    newEmployees,
    resignedEmployees: resigned,
    endingThisMonth,
    endingNextMonth,
    endingNext2Months,
    endingThisMonthEmployees,
    endingNextMonthEmployees,
    endingNext2MonthsEmployees,
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

/** The only two Marital Status values ResignLineChart's Marital Status breakdown shows — Divorced/Widowed/blank are dropped entirely, no "Other" bucket. */
const MARITAL_STATUS_SERIES = ["Belum Kawin (Single)", "Kawin (Married)"];

function topNSeries(topN: number) {
  return (totals: Map<string, number>): string[] =>
    Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([key]) => key);
}

function fixedSeries(labels: string[]) {
  return (): string[] => labels;
}

/**
 * Resignations (by Exit Date) for the given year, split into monthly line
 * series by whatever `groupOf` extracts (Department or Marital Status) —
 * shared by both breakdowns ResignLineChart toggles between. `selectSeries`
 * decides which series actually get a line (e.g. topNSeries(5) for the
 * highest-resign departments, or fixedSeries([...]) for a fixed allow-list
 * like Marital Status) — anything not selected is dropped from the chart
 * entirely rather than bucketed into an "Other" line.
 */
function computeResignBreakdown(
  items: EmployeeListItem[],
  year: number,
  groupOf: (e: EmployeeListItem) => string,
  selectSeries: (totals: Map<string, number>) => string[],
): ResignBreakdownData {
  const resignedThisYear = items.filter((e) => e.exitDate && yearOf(e.exitDate) === String(year));

  const totals = new Map<string, number>();
  for (const e of resignedThisYear) {
    const key = groupOf(e).trim() || "(None)";
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const series = selectSeries(totals);
  const seriesSet = new Set(series);

  const countsByMonth: Record<string, number[]> = {};
  for (const key of series) countsByMonth[key] = new Array(12).fill(0);

  for (const e of resignedThisYear) {
    const key = groupOf(e).trim() || "(None)";
    if (!seriesSet.has(key)) continue;
    const m = Number(e.exitDate.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) countsByMonth[key][m]++;
  }

  const points: ResignBreakdownMonthPoint[] = MONTH_NAMES_SHORT.map((month, i) => {
    const point: ResignBreakdownMonthPoint = { month };
    for (const key of series) point[key] = countsByMonth[key][i];
    return point;
  });

  return { points, series };
}

function computeWalkinApplicantsByMonth(registrations: OnlineRegistration[], year: number): WalkinApplicantsMonthPoint[] {
  const applicantPool = new Array(12).fill(0);
  const newHiring = new Array(12).fill(0);
  const approved = new Array(12).fill(0);
  const rejected = new Array(12).fill(0);
  for (const r of registrations) {
    if (r.sourcePlatform !== "walkin") continue;
    if (yearOf(r.submittedAt) !== String(year)) continue;
    const m = Number(r.submittedAt.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    const status = r.registrationStatus.trim().toLowerCase();
    if (status === "approved") approved[m]++;
    else if (status === "rejected") rejected[m]++;
    else if (status === "applicant_pool") applicantPool[m]++;
    else newHiring[m]++; // promoted forward (pending) or any other post-Applicant-Pool status
  }
  return MONTH_NAMES_SHORT.map((month, i) => ({
    month,
    applicantPool: applicantPool[i],
    newHiring: newHiring[i],
    approved: approved[i],
    rejected: rejected[i],
  }));
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
