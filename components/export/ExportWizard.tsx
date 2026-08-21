"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownUp, CalendarDays, CheckCircle2, Circle, FileSpreadsheet, Loader2, Search, Settings2 } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ExportPreview, type ExportPreviewResponse } from "@/components/export/ExportPreview";
import type { ExportTemplateListItem } from "@/lib/export-template-service";
import type { EmployeeRecord } from "@/lib/employee-service";
import type { SelectOption } from "@/lib/master-data-options";
import { formatDateDMY } from "@/lib/date-format";

export type SelectionMode = "ALL_ACTIVE" | "SELECTED" | "FILTERED";

export interface ExportRequestBody {
  templateId: string;
  selectionMode: SelectionMode;
  employeeIds?: string[];
  filters?: {
    search?: string;
    department?: string;
    position?: string;
    level?: string;
    status?: string;
  };
}

interface ExportWizardProps {
  templates: ExportTemplateListItem[];
  employees: EmployeeRecord[];
  departmentOptions: SelectOption[];
  positionOptions: SelectOption[];
  levelOptions: SelectOption[];
  statusOptions: SelectOption[];
  initialTemplateId?: string;
}

const ALL = "__all__";

type SortField = "none" | "joinDate" | "month" | "year";

const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: "none", label: "Default order" },
  { value: "joinDate", label: "Join Date" },
  { value: "month", label: "Join Month" },
  { value: "year", label: "Join Year" },
];

function sortKey(e: EmployeeRecord, field: SortField): string {
  const joinDate = e.joinDate ?? ""; // "YYYY-MM-DD" from the date input, sorts correctly as text
  if (field === "joinDate") return joinDate;
  if (field === "year") return joinDate.slice(0, 4);
  if (field === "month") return joinDate.slice(5, 7);
  return "";
}

/** Matches the app-wide "Active" convention (dashboard, Active Employees list): anything but "Inactive" counts as active. */
function isActive(e: EmployeeRecord): boolean {
  return (e.status ?? "").toLowerCase() !== "inactive";
}

export function ExportWizard({
  templates,
  employees,
  departmentOptions,
  positionOptions,
  levelOptions,
  statusOptions,
  initialTemplateId,
}: ExportWizardProps) {
  const [templateId, setTemplateId] = useState<string>(
    (initialTemplateId && templates.some((t) => t.id === initialTemplateId) ? initialTemplateId : templates[0]?.id) ??
      "",
  );
  const [mode, setMode] = useState<SelectionMode>("ALL_ACTIVE");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectSearch, setSelectSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("none");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState({ search: "", department: "", position: "", level: "", status: "" });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<ExportPreviewResponse | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const activeCount = useMemo(() => employees.filter(isActive).length, [employees]);

  const selectableList = useMemo(() => {
    const q = selectSearch.trim().toLowerCase();
    const filtered = q
      ? employees.filter((e) => `${e.nik ?? ""} ${e.name ?? ""}`.toLowerCase().includes(q))
      : employees;
    if (sortField === "none") return filtered;
    const sorted = [...filtered].sort((a, b) => sortKey(a, sortField).localeCompare(sortKey(b, sortField)));
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [employees, selectSearch, sortField, sortDir]);

  const filteredList = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return employees.filter((e) => {
      if (search && !`${e.nik ?? ""} ${e.name ?? ""}`.toLowerCase().includes(search)) return false;
      if (filters.department && e.department !== filters.department) return false;
      if (filters.position && e.position !== filters.position) return false;
      if (filters.level && e.level !== filters.level) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    });
  }, [employees, filters]);

  const selectedCount =
    mode === "ALL_ACTIVE" ? activeCount : mode === "SELECTED" ? selectedIds.size : filteredList.length;

  function toggleSelected(recordId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allShownSelected = selectableList.every((e) => prev.has(e.recordId));
      const next = new Set(prev);
      if (allShownSelected) {
        selectableList.forEach((e) => next.delete(e.recordId));
      } else {
        selectableList.forEach((e) => next.add(e.recordId));
      }
      return next;
    });
  }

  function buildRequestBody(): ExportRequestBody {
    if (mode === "SELECTED") {
      return { templateId, selectionMode: mode, employeeIds: Array.from(selectedIds) };
    }
    if (mode === "FILTERED") {
      return { templateId, selectionMode: mode, filters };
    }
    return { templateId, selectionMode: mode };
  }

  async function handleContinue() {
    if (!templateId || selectedCount === 0) return;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/export/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody()),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to build preview.");
        return;
      }
      setPreview(data as ExportPreviewResponse);
    } catch {
      toast.error("Unable to connect to Employee Database.");
    } finally {
      setPreviewLoading(false);
    }
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileSpreadsheet className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">No active export template available.</h2>
          <p className="max-w-md text-sm text-muted-foreground">Create an export template first.</p>
          <Button asChild className="mt-2">
            <Link href="/export/templates/new">
              <Settings2 />
              Create Export Template
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (preview) {
    return (
      <ExportPreview
        preview={preview}
        requestBody={buildRequestBody()}
        onBack={() => setPreview(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="sm:w-96">
              <SelectValue placeholder="Select Export Template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTemplate && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Template</p>
                <p className="font-medium">{selectedTemplate.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sheets</p>
                <p className="font-medium">{selectedTemplate.sheetCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Key</p>
                <p className="font-medium">{selectedTemplate.keyField.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="success">{selectedTemplate.status}</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ModeOption
              label="All Active Employees"
              description={`${activeCount} employee${activeCount === 1 ? "" : "s"}`}
              selected={mode === "ALL_ACTIVE"}
              onSelect={() => setMode("ALL_ACTIVE")}
            />
            <ModeOption
              label="Selected Employees"
              description={`${selectedIds.size} selected`}
              selected={mode === "SELECTED"}
              onSelect={() => setMode("SELECTED")}
            />
            <ModeOption
              label="Filter Employees"
              description={`${filteredList.length} match`}
              selected={mode === "FILTERED"}
              onSelect={() => setMode("FILTERED")}
            />
          </div>

          {mode === "SELECTED" && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search NIK / Name"
                    value={selectSearch}
                    onChange={(e) => setSelectSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                  <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={sortField === "none"}
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    title={sortDir === "asc" ? "Ascending" : "Descending"}
                  >
                    <ArrowDownUp className={sortDir === "desc" ? "rotate-180" : undefined} />
                  </Button>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectableList.length > 0 && selectableList.every((e) => selectedIds.has(e.recordId))}
                    onCheckedChange={toggleSelectAll}
                  />
                  Select All ({selectableList.length})
                </label>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                {selectableList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No employees match &quot;{selectSearch}&quot;.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="w-10 px-3 py-2 font-normal" />
                        <th className="px-3 py-2 font-normal">NIK</th>
                        <th className="px-3 py-2 font-normal">Name</th>
                        <th className="px-3 py-2 font-normal">Join Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectableList.map((e) => (
                        <tr
                          key={e.recordId}
                          className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                          onClick={() => toggleSelected(e.recordId)}
                        >
                          <td className="w-10 px-3 py-2">
                            <Checkbox
                              checked={selectedIds.has(e.recordId)}
                              onCheckedChange={() => toggleSelected(e.recordId)}
                              onClick={(ev) => ev.stopPropagation()}
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{e.nik}</td>
                          <td className="px-3 py-2">{e.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDateDMY(e.joinDate) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {mode === "FILTERED" && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search NIK / Name"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <FilterSelect
                  placeholder="All Departments"
                  value={filters.department}
                  options={departmentOptions}
                  onChange={(v) => setFilters((f) => ({ ...f, department: v }))}
                />
                <FilterSelect
                  placeholder="All Positions"
                  value={filters.position}
                  options={positionOptions}
                  onChange={(v) => setFilters((f) => ({ ...f, position: v }))}
                />
                <FilterSelect
                  placeholder="All Levels"
                  value={filters.level}
                  options={levelOptions}
                  onChange={(v) => setFilters((f) => ({ ...f, level: v }))}
                />
                <FilterSelect
                  placeholder="Active"
                  value={filters.status}
                  options={statusOptions}
                  onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              {selectedCount === 0 ? (
                "No employee selected."
              ) : (
                <>
                  Selected: <span className="font-medium text-foreground">{selectedCount} employees</span>
                </>
              )}
            </p>
            <Button onClick={handleContinue} disabled={selectedCount === 0 || !templateId || previewLoading}>
              {previewLoading && <Loader2 className="animate-spin" />}
              {previewLoading ? "Building preview..." : "Continue to Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModeOption({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
      }`}
    >
      {selected ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function FilterSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
