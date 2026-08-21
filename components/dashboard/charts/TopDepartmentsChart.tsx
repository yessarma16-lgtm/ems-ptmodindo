"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/dashboard/charts/ChartCard";
import type { CountPoint } from "@/lib/dashboard-service";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#0ea5e9", "#6366f1", "#14b8a6", "#eab308", "#ec4899"];

export function TopDepartmentsChart({ data, periodLabel }: { data: CountPoint[]; periodLabel: string }) {
  return (
    <ChartCard title="Top 10 Man Power per Department" subtitle={`Active employees as of ${periodLabel}, by Department`}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
            cursor={{ fill: "var(--muted)" }}
          />
          <Bar dataKey="count" name="Employees" radius={[0, 6, 6, 0]} maxBarSize={20}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
