"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartCard } from "@/components/dashboard/charts/ChartCard";
import type { CountPoint } from "@/lib/dashboard-service";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#0ea5e9", "#6366f1"];

export function EmployeeTypeChart({ data }: { data: CountPoint[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <ChartCard title="Employee Type" subtitle="Active employees, by Type">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ResponsiveContainer width="100%" height={320} className="sm:max-w-[260px]">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="label" innerRadius={75} outerRadius={120} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--card)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="w-full space-y-2 sm:w-auto sm:flex-1">
          {data.map((d, i) => (
            <div key={d.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {d.label}
              </span>
              <span className="font-medium text-foreground">
                {d.count} <span className="text-xs text-muted-foreground">({total ? Math.round((d.count / total) * 100) : 0}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
