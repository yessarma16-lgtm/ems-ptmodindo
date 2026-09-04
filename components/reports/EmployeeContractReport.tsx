"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Play, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EmployeeRecord } from "@/lib/employee-service";

type EndingFilter = "thisMonth" | "nextMonth" | "next2Months";
type ColumnKey = "nik" | "name" | "department" | "position" | "level" | "shed" | "age" | "joinDate" | "contractStatus" | "contractCloseFirst" | "contractCloseSecond" | "contractCloseThird" | "contractCloseFourth" | "contractCloseFiveth";
const endingLabels: Record<EndingFilter, string> = { thisMonth: "Contract Ending This Month", nextMonth: "Contract Ending Next Month", next2Months: "Contract Ending Next 2 Months" };
const allEndingFilters = Object.keys(endingLabels) as EndingFilter[];
const closeKeys: ColumnKey[] = ["contractCloseFirst", "contractCloseSecond", "contractCloseThird", "contractCloseFourth", "contractCloseFiveth"];
const columns: { key: ColumnKey; label: string }[] = [
  { key: "nik", label: "NIK (EMPLOYEE ID)" }, { key: "name", label: "NAME" }, { key: "department", label: "DEPARTMENT" }, { key: "position", label: "POTITION" }, { key: "level", label: "LEVEL" }, { key: "shed", label: "SHED" }, { key: "age", label: "AGE" }, { key: "joinDate", label: "JOIN DATE" }, { key: "contractStatus", label: "CONTRACT STATUS" }, { key: "contractCloseFirst", label: "CONTRACT CLOSE-FIRST" }, { key: "contractCloseSecond", label: "CONTRACT CLOSE-SECOND" }, { key: "contractCloseThird", label: "CONTRACT CLOSE-THIRD" }, { key: "contractCloseFourth", label: "CONTRACT CLOSE-FOURTH" }, { key: "contractCloseFiveth", label: "CONTRACT CLOSE-FIVETH" },
];
const text = (employee: EmployeeRecord, key: string) => String(employee[key] ?? "").trim();
const date = (employee: EmployeeRecord, key: string) => text(employee, key).slice(0, 10);
const closeDates = (employee: EmployeeRecord) => closeKeys.map((key) => date(employee, key)).filter(Boolean);
const formatDate = (raw: string) => raw ? raw.split("-").reverse().join("-") : "-";

function monthRange(offset: number, reference = new Date()) {
  const year = reference.getUTCFullYear(); const month = reference.getUTCMonth() + offset;
  const start = new Date(Date.UTC(year, month, 1)); const end = new Date(Date.UTC(year, month + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function rangeForFilter(filter: EndingFilter) { return monthRange(filter === "thisMonth" ? 0 : filter === "nextMonth" ? 1 : 2); }
function dateInRange(raw: string, from: string, to: string) { return Boolean(raw) && (!from || raw >= from) && (!to || raw <= to); }
function matches(employee: EmployeeRecord, ending: EndingFilter | undefined, from: string, to: string) {
  if (text(employee, "status").toLowerCase() === "inactive") return false;
  const selectedRange = ending ? rangeForFilter(ending) : { from, to };
  return closeDates(employee).some((raw) => dateInRange(raw, selectedRange.from, selectedRange.to));
}
function cellValue(employee: EmployeeRecord, key: ColumnKey) {
  return key.includes("contractClose") || key === "joinDate" ? formatDate(date(employee, key)) : text(employee, key) || "-";
}
function sortValue(employee: EmployeeRecord, key: ColumnKey) {
  return key.includes("contractClose") || key === "joinDate" ? date(employee, key) : text(employee, key).toLowerCase();
}

function ContractTable({ rows, label }: { rows: EmployeeRecord[]; label: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<ColumnKey>("joinDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const visibleRows = useMemo(() => {
    const filtered = [...rows];
    return [...filtered].sort((a, b) => { const result = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey), undefined, { numeric: true }); return sortDirection === "asc" ? result : -result; });
  }, [rows, sortDirection, sortKey]);
  const sort = (key: ColumnKey) => { if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("asc"); } };
  return <div className="space-y-2"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{label}</h3><p className="text-xs text-muted-foreground">{visibleRows.length} active employee{visibleRows.length !== rows.length ? ` (from ${rows.length})` : ""}</p></div></div><div className="max-w-full overflow-auto"><table className="w-max border-collapse text-xs"><thead><tr className="bg-muted"><th className="whitespace-nowrap border px-3 py-2 text-left font-semibold">No</th>{columns.map((column) => <th className="whitespace-nowrap border px-2 py-1 text-left font-semibold" key={column.key}><button type="button" className="w-full text-left hover:text-primary" onClick={() => sort(column.key)} title="Click to sort">{column.label}</button></th>)}</tr></thead><tbody>{visibleRows.map((employee, index) => <tr key={employee.recordId}><td className="border px-3 py-2 text-center">{index + 1}</td>{columns.map((column) => <td className="border px-3 py-2" key={column.key}>{cellValue(employee, column.key)}</td>)}</tr>)}</tbody></table></div></div>;
}

export function EmployeeContractReport({ employees }: { employees: EmployeeRecord[] }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [selected, setSelected] = useState<EndingFilter[]>([]); const [hasRun, setHasRun] = useState(false);
  const groups = useMemo(() => selected.length ? selected.map((ending) => ({ ending, label: endingLabels[ending], rows: employees.filter((employee) => matches(employee, ending, from, to)) })) : [{ ending: undefined, label: from || to ? `Contract Ending ${from || "awal"} s/d ${to || "akhir"}` : "All Contract Ending", rows: employees.filter((employee) => matches(employee, undefined, from, to)) }], [employees, from, selected, to]);
  const addFilter = () => { const next = allEndingFilters.find((filter) => !selected.includes(filter)); if (next) setSelected((current) => [...current, next]); }; const runReport = () => { if (!from && !to && selected.length === 0) { toast.error("Please select at least one date range or contract filter before running the report."); return; } setHasRun(true); };
  const clear = () => { setFrom(""); setTo(""); setSelected([]); setHasRun(false); };
  const download = () => { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); selected.forEach((filter) => params.append("ending", filter)); window.open(`/api/reports/employee-contract/export?${params.toString()}`, "_blank"); };
  return <Card className="mt-5"><CardContent className="space-y-4 pt-4"><h2 className="text-base font-semibold">Employee Contract Data</h2><div className="flex flex-wrap items-end gap-2"><div><label className="text-xs">Date From</label><Input type="date" className="mt-1 h-8" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><label className="text-xs">Date To</label><Input type="date" className="mt-1 h-8" value={to} onChange={(event) => setTo(event.target.value)} /></div><Button size="sm" variant="outline" onClick={addFilter} disabled={selected.length >= allEndingFilters.length}><Plus className="mr-1 size-3" />Add Selected Data</Button><Button size="sm" onClick={runReport}><Play className="mr-1 size-3" />Run</Button><Button size="sm" variant="outline" onClick={clear}><RotateCcw className="mr-1 size-3" />Clear</Button><Button size="sm" variant="outline" className="ml-auto" onClick={download}><Download className="mr-1 size-3" />Download Excel</Button></div>{selected.length > 0 && <div className="space-y-2 border-t pt-3"><p className="text-xs font-medium">Filter Contract Ending</p>{selected.map((filter, index) => <div className="flex max-w-xl items-end gap-2" key={filter}><label className="min-w-0 flex-1 text-xs">Selected Data {index + 1}<select className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs" value={filter} onChange={(event) => setSelected((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value as EndingFilter : item))}>{allEndingFilters.map((item) => <option key={item} value={item}>{endingLabels[item]}</option>)}</select></label><Button variant="ghost" size="icon" className="size-8" onClick={() => setSelected((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="size-3" /></Button></div>)}</div>}{hasRun && <div className="space-y-5 border-t pt-4">{groups.map((group) => <ContractTable key={group.ending ?? "manual"} label={group.label} rows={group.rows} />)}</div>}</CardContent></Card>;
}
