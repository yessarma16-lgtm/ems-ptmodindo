"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const ALL_MONTHS = "__all__";
const ALL_YEARS = "__all__";

interface DashboardFilterBarProps {
  month: string;
  year: string;
  availableYears: string[];
}

export function DashboardFilterBar({ month, year, availableYears }: DashboardFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function navigate(nextMonth: string, nextYear: string) {
    const params = new URLSearchParams();
    if (nextMonth) params.set("month", nextMonth);
    params.set("year", nextYear || "all");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={month || ALL_MONTHS} onValueChange={(v) => navigate(v === ALL_MONTHS ? "" : v, year)}>
        <SelectTrigger className="w-[140px] rounded-xl bg-card">
          <SelectValue placeholder="All Months" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MONTHS}>All Months</SelectItem>
          {MONTHS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={year || ALL_YEARS} onValueChange={(v) => navigate(month, v === ALL_YEARS ? "" : v)}>
        <SelectTrigger className="w-[130px] rounded-xl bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_YEARS}>All Years</SelectItem>
          {availableYears.map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
