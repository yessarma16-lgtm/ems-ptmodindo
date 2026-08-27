import "server-only";

import { getEmployeeListPage } from "@/lib/employee-service";
import { getAllMasterData } from "@/lib/master-data-service";
import { toEmployeeFormMasterData, type SelectOption } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import type { EmployeeListItem, EmployeeListQuery, EmployeeListScope, EmployeeSortKey } from "@/lib/database/types";

export type { EmployeeListScope };

const PAGE_SIZE = 100;
const SORT_KEYS: EmployeeSortKey[] = ["name", "department", "joinDate", "exitDate"];

/** Reads the ?q=/dept=/status=/contract=/sort=/dir=/page= URL search params Next.js passes a page — same query shape EmployeeTable writes back via router navigation. */
export function parseEmployeeListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  scope: EmployeeListScope,
): EmployeeListQuery {
  const get = (key: string): string => {
    const v = searchParams[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const sortKeyRaw = get("sort");
  const sortKey = (SORT_KEYS as string[]).includes(sortKeyRaw) ? (sortKeyRaw as EmployeeSortKey) : "name";
  const page = Math.max(1, parseInt(get("page"), 10) || 1);
  const positionRaw = searchParams["position"];
  const position = (Array.isArray(positionRaw) ? positionRaw : positionRaw ? [positionRaw] : []).filter(Boolean);

  return {
    scope,
    search: get("q"),
    department: get("dept"),
    status: get("status"),
    position,
    contractStatus: get("contract"),
    dateFrom: get("from"),
    dateTo: get("to"),
    sortKey,
    sortAsc: get("dir") !== "desc",
    page,
    pageSize: PAGE_SIZE,
  };
}

export interface EmployeeListPageData {
  configured: boolean;
  connectionError: string | null;
  items: EmployeeListItem[];
  total: number;
  query: EmployeeListQuery;
  departmentOptions: SelectOption[];
  contractStatusOptions: SelectOption[];
  statusOptions: SelectOption[];
  positionOptions: SelectOption[];
}

/**
 * Shared data loader for every Employee sub-module view (Active / Inactive /
 * Expatriate / ...). Search/filter/sort/pagination all happen in the
 * database query itself (see getEmployeeListPage) — only the current page's
 * rows are fetched, not the whole table. Master data (for the filter
 * dropdown option lists) is fetched in parallel alongside it.
 */
export async function loadEmployeeListPageData(query: EmployeeListQuery): Promise<EmployeeListPageData> {
  const configured = isDatabaseConfigured();
  let items: EmployeeListItem[] = [];
  let total = 0;
  let connectionError: string | null = null;
  let departmentOptions: SelectOption[] = [];
  let contractStatusOptions: SelectOption[] = [];
  let statusOptions: SelectOption[] = [];
  let positionOptions: SelectOption[] = [];

  if (configured) {
    const [pageResult, masterDataResult] = await Promise.allSettled([getEmployeeListPage(query), getAllMasterData()]);

    if (pageResult.status === "fulfilled") {
      items = pageResult.value.items;
      total = pageResult.value.total;
    } else {
      const err = pageResult.reason;
      connectionError =
        err instanceof DatabaseConnectionError ? err.message : "Unable to connect to Employee Database.";
    }

    // Filter options are non-critical — if master data fails to load, the
    // list itself still works, filters just fall back to "All".
    if (masterDataResult.status === "fulfilled") {
      const masterData = toEmployeeFormMasterData(masterDataResult.value);
      departmentOptions = masterData.departments;
      contractStatusOptions = masterData.lookup.CONTRACT_STATUS ?? [];
      statusOptions = masterData.lookup.EMPLOYEE_STATUS ?? [];
      positionOptions = masterData.positions;
    }
  }

  return {
    configured,
    connectionError,
    items,
    total,
    query,
    departmentOptions,
    contractStatusOptions,
    statusOptions,
    positionOptions,
  };
}
