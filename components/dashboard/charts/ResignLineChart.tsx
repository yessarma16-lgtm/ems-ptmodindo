"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard, LegendDot } from "@/components/dashboard/charts/ChartCard";
import { cn } from "@/lib/utils";
import type { ResignBreakdownData } from "@/lib/dashboard-service";

const COLORS = ["#f43f5e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#6366f1", "#ec4899"];

type GroupBy = "department" | "maritalStatus";

export function ResignLineChart({
  year,
  byDepartment,
  byMaritalStatus,
}: {
  year: string;
  byDepartment: ResignBreakdownData;
  byMaritalStatus: ResignBreakdownData;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const active = groupBy === "department" ? byDepartment : byMaritalStatus;

  return (
    <ChartCard
      title="Resignations"
      subtitle={`Year ${year}, by Exit Date — grouped by ${groupBy === "department" ? "Department" : "Marital Status"}`}
      legend={
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
          {(["department", "maritalStatus"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setGroupBy(key)}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors",
                groupBy === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "department" ? "Department" : "Marital Status"}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {active.series.map((s, i) => (
          <LegendDot key={s} color={COLORS[i % COLORS.length]} label={s} />
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={active.points} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
            cursor={{ stroke: "var(--border)" }}
          />
          {active.series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              name={s}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
