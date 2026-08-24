"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowUpDown, ChevronLeft, ChevronRight, Eye, Loader2, Pencil } from "lucide-react";

import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmployeeFilters, type EmployeeFiltersState } from "@/components/employees/EmployeeFilters";
import type { EmployeeListItem, EmployeeListQuery, EmployeeSortKey } from "@/lib/employee-service";
import type { SelectOption } from "@/lib/master-data-options";
import { formatDateDMY } from "@/lib/date-format";

interface EmployeeTableProps {
  items: EmployeeListItem[];
  total: number;
  query: EmployeeListQuery;
  departmentOptions: SelectOption[];
  contractStatusOptions: SelectOption[];
  statusOptions: SelectOption[];
  /** "inactive" swaps the Type/Join Date columns for Join Date/Resign Date — more relevant once someone has left. */
  variant?: "active" | "inactive";
  /** Label for the date range filter (e.g. "Join Date", "Resign Date") — omit to hide it (e.g. on the Expatriate page). */
  dateFilterLabel?: string;
}

function statusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  const s = status.toLowerCase();
  if (s === "active") return "success";
  if (s === "on leave") return "warning";
  if (s === "resigned" || s === "terminated") return "destructive";
  return "secondary";
}

const SEARCH_DEBOUNCE_MS = 400;

export function EmployeeTable({
  items,
  total,
  query,
  departmentOptions,
  contractStatusOptions,
  statusOptions,
  variant = "active",
  dateFilterLabel,
}: EmployeeTableProps) {
  const isInactiveView = variant === "inactive";
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Local text so typing feels instant; the actual server round trip is
  // debounced so we're not re-querying the database on every keystroke.
  const [searchText, setSearchText] = useState(query.search);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync local text when the URL's search term changes from outside this
  // component (browser back/forward) — set during render, not an effect, so
  // it doesn't cost an extra commit (React's documented pattern for
  // "adjusting state when a prop changes").
  const [prevQuerySearch, setPrevQuerySearch] = useState(query.search);
  if (query.search !== prevQuerySearch) {
    setPrevQuerySearch(query.search);
    setSearchText(query.search);
  }

  function navigate(next: Partial<EmployeeListQuery>, resetPage = true) {
    const merged: EmployeeListQuery = { ...query, ...next, page: resetPage ? 1 : (next.page ?? query.page) };
    const params = new URLSearchParams();
    if (merged.search) params.set("q", merged.search);
    if (merged.department) params.set("dept", merged.department);
    if (merged.status) params.set("status", merged.status);
    if (merged.contractStatus) params.set("contract", merged.contractStatus);
    if (merged.dateFrom) params.set("from", merged.dateFrom);
    if (merged.dateTo) params.set("to", merged.dateTo);
    if (merged.sortKey !== "name") params.set("sort", merged.sortKey);
    if (!merged.sortAsc) params.set("dir", "desc");
    if (merged.page > 1) params.set("page", String(merged.page));

    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function handleFiltersChange(next: EmployeeFiltersState) {
    const searchChanged = next.search !== searchText;
    setSearchText(next.search);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const applyNavigation = () =>
      navigate({
        search: next.search,
        department: next.department,
        status: next.status,
        contractStatus: next.contractStatus,
        dateFrom: next.dateFrom,
        dateTo: next.dateTo,
      });

    if (searchChanged) {
      // Free-text search is debounced so we're not re-querying on every
      // keystroke. Selects apply immediately and always send the CURRENT
      // search text (not a stale value from before this change) — and
      // cancelling any pending debounce above means a select change right
      // after typing can't get overwritten by an outdated debounced call
      // firing later.
      searchDebounceRef.current = setTimeout(applyNavigation, SEARCH_DEBOUNCE_MS);
    } else {
      applyNavigation();
    }
  }

  function toggleSort(key: EmployeeSortKey) {
    if (query.sortKey === key) navigate({ sortAsc: !query.sortAsc });
    else navigate({ sortKey: key, sortAsc: true });
  }

  function handleDateFieldChange(field: "dateFrom" | "dateTo", value: string) {
    handleFiltersChange({
      search: searchText,
      department: query.department,
      status: query.status,
      contractStatus: query.contractStatus,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      [field]: value,
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const currentPage = Math.min(query.page, totalPages);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">{total}</span> employees
        </p>
        {dateFilterLabel && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Label className="mb-0 shrink-0 text-sm text-muted-foreground">{dateFilterLabel} from</Label>
              <Input
                type="date"
                value={query.dateFrom}
                onChange={(e) => handleDateFieldChange("dateFrom", e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="mb-0 shrink-0 text-sm text-muted-foreground">to</Label>
              <Input
                type="date"
                value={query.dateTo}
                onChange={(e) => handleDateFieldChange("dateTo", e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
          </div>
        )}
      </div>

      <EmployeeFilters
        value={{
          search: searchText,
          department: query.department,
          status: query.status,
          contractStatus: query.contractStatus,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        }}
        onChange={handleFiltersChange}
        departmentOptions={departmentOptions}
        contractStatusOptions={contractStatusOptions}
        statusOptions={statusOptions}
      />

      <div
        className={`max-h-[70vh] overflow-auto rounded-xl border border-border bg-card transition-opacity ${isPending ? "opacity-60" : ""}`}
      >
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
            <TableRow>
              <TableHead className="w-12">SN</TableHead>
              <TableHead>NIK / Employee ID</TableHead>
              <TableHead>
                <button
                  className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground"
                  onClick={() => toggleSort("name")}
                  type="button"
                >
                  Name <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground"
                  onClick={() => toggleSort("department")}
                  type="button"
                >
                  Department <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>{isInactiveView ? "Join Date" : "Type"}</TableHead>
              <TableHead>
                <button
                  className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground"
                  onClick={() => toggleSort(isInactiveView ? "exitDate" : "joinDate")}
                  type="button"
                >
                  {isInactiveView ? "Resign Date" : "Join Date"} <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead>Contract Status</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Interview Evaluation</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
            {items.map((employee, idx) => (
              <TableRow
                key={employee.recordId}
                className="cursor-pointer"
                onClick={() => router.push(`/employees/${employee.recordId}`)}
              >
                <TableCell className="text-muted-foreground">
                  {(currentPage - 1) * query.pageSize + idx + 1}
                </TableCell>
                <TableCell className="font-medium">{employee.nik}</TableCell>
                <TableCell>{employee.name}</TableCell>
                <TableCell>{employee.department}</TableCell>
                <TableCell>{employee.position}</TableCell>
                <TableCell>{employee.level}</TableCell>
                <TableCell>{isInactiveView ? formatDateDMY(employee.joinDate) : employee.type}</TableCell>
                <TableCell>{isInactiveView ? formatDateDMY(employee.exitDate) : formatDateDMY(employee.joinDate)}</TableCell>
                <TableCell>{employee.contractStatus}</TableCell>
                <TableCell>
                  {employee.status ? (
                    <Badge variant={statusVariant(employee.status)}>{employee.status}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px] truncate" title={employee.interviewEvaluation || undefined}>
                  {employee.interviewEvaluation || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild title="View">
                      <Link href={`/employees/${employee.recordId}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Edit">
                      <Link href={`/employees/${employee.recordId}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            Showing {(currentPage - 1) * query.pageSize + 1}–
            {Math.min(currentPage * query.pageSize, total)} of {total} employees
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage <= 1 || isPending}
              onClick={() => navigate({ page: currentPage - 1 }, false)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-16 text-center">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => navigate({ page: currentPage + 1 }, false)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
