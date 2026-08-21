"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard, LegendDot } from "@/components/dashboard/charts/ChartCard";
import type { MonthlyHeadcountPoint } from "@/lib/dashboard-service";

const ACTIVE_COLOR = "#3b82f6";
const INACTIVE_COLOR = "#f59e0b";

export function MonthlyHeadcountChart({ data, year }: { data: MonthlyHeadcountPoint[]; year: string }) {
  return (
    <ChartCard
      title="Monthly Employee Statistics"
      subtitle={`Active vs Inactive headcount at each month-end · ${year}`}
      legend={
        <div className="flex items-center gap-3">
          <LegendDot color={ACTIVE_COLOR} label="Active" />
          <LegendDot color={INACTIVE_COLOR} label="Inactive" />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={ACTIVE_COLOR} stopOpacity={0.35} />
              <stop offset="95%" stopColor={ACTIVE_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="inactiveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={INACTIVE_COLOR} stopOpacity={0.35} />
              <stop offset="95%" stopColor={INACTIVE_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="active"
            name="Active"
            stroke={ACTIVE_COLOR}
            fill="url(#activeFill)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="inactive"
            name="Inactive"
            stroke={INACTIVE_COLOR}
            fill="url(#inactiveFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
