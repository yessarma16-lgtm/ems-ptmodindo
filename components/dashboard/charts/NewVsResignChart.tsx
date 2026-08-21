"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard, LegendDot } from "@/components/dashboard/charts/ChartCard";
import type { MonthPoint } from "@/lib/dashboard-service";

const JOINED_COLOR = "#10b981";
const RESIGNED_COLOR = "#f43f5e";

export function NewVsResignChart({ data, year }: { data: MonthPoint[]; year: string }) {
  return (
    <ChartCard
      title="New vs Resigned Employees"
      subtitle={`Year ${year}, by Join Date / Resign Date`}
      legend={
        <div className="flex items-center gap-3">
          <LegendDot color={JOINED_COLOR} label="New" />
          <LegendDot color={RESIGNED_COLOR} label="Resigned" />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
            cursor={{ fill: "var(--muted)" }}
          />
          <Bar dataKey="joined" name="New" fill={JOINED_COLOR} radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="resigned" name="Resigned" fill={RESIGNED_COLOR} radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
