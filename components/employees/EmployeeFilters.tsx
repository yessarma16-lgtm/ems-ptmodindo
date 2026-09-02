"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MultiSelectCheckboxFilter } from "@/components/employees/MultiSelectCheckboxFilter";
import type { SelectOption } from "@/lib/master-data-options";

export interface EmployeeFiltersState {
  search: string;
  department: string;
  status: string;
  position: string[];
  contractStatus: string;
  dateFrom: string;
  dateTo: string;
}

interface EmployeeFiltersProps {
  value: EmployeeFiltersState;
  onChange: (next: EmployeeFiltersState) => void;
  departmentOptions: SelectOption[];
  contractStatusOptions: SelectOption[];
  statusOptions: SelectOption[];
  positionOptions: SelectOption[];
  /** Replaces the Status dropdown with a Position checkbox filter — used on the Active Employees page, where a Status filter is redundant (the page already scopes to Active). */
  usePositionFilter?: boolean;
}

const ALL = "__all__";

export function EmployeeFilters({
  value,
  onChange,
  departmentOptions,
  contractStatusOptions,
  statusOptions,
  positionOptions,
  usePositionFilter = false,
}: EmployeeFiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, NIK, or department..."
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            className="pl-9 pr-9"
          />
          {value.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ ...value, search: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Select
          value={value.department || ALL}
          onValueChange={(v) => onChange({ ...value, department: v === ALL ? "" : v })}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Departments</SelectItem>
            {departmentOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.contractStatus || ALL}
          onValueChange={(v) => onChange({ ...value, contractStatus: v === ALL ? "" : v })}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Contract Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Contract Status</SelectItem>
            {contractStatusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {usePositionFilter ? (
          <MultiSelectCheckboxFilter
            label="Position"
            options={positionOptions}
            selected={value.position}
            onChange={(next) => onChange({ ...value, position: next })}
          />
        ) : (
          <Select value={value.status || ALL} onValueChange={(v) => onChange({ ...value, status: v === ALL ? "" : v })}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Status</SelectItem>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
