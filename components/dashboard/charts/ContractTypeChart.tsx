"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard, LegendDot } from "@/components/dashboard/charts/ChartCard";
import type { ContractTypeMonthPoint } from "@/lib/dashboard-service";

const PERM_PROB_COLOR = "#8b5cf6";
const CONTRACT_COLOR = "#f59e0b";

export function ContractTypeChart({ data, year }: { data: ContractTypeMonthPoint[]; year: string }) {
  return (
    <ChartCard
      title="Permanent + Probation vs Contract"
      subtitle={`Year ${year}, by Join Date and Contract Status`}
      legend={
        <div className="flex items-center gap-3">
          <LegendDot color={PERM_PROB_COLOR} label="Permanent + Probation" />
          <LegendDot color={CONTRACT_COLOR} label="Contract" />
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
          <Bar dataKey="permanentProbation" name="Permanent + Probation" stackId="a" fill={PERM_PROB_COLOR} radius={[0, 0, 0, 0]} maxBarSize={28} />
          <Bar dataKey="contract" name="Contract" stackId="a" fill={CONTRACT_COLOR} radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
