"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard, LegendDot } from "@/components/dashboard/charts/ChartCard";
import type { WalkinApplicantsMonthPoint } from "@/lib/dashboard-service";

const APPLICANT_POOL_COLOR = "#3b82f6";
const NEW_HIRING_COLOR = "#f59e0b";
const APPROVED_COLOR = "#10b981";
const REJECTED_COLOR = "#8b5cf6";

/**
 * Walk-in (Applicant Pool QR) applicants, by the month they applied, split by
 * their current stage — a candidate keeps counting here even after advancing
 * to New Hiring or Approved, since the bar is about where they came FROM.
 */
export function WalkinApplicantsChart({ data, year }: { data: WalkinApplicantsMonthPoint[]; year: string }) {
  return (
    <ChartCard
      title="Walk-in Applicants"
      subtitle={`Year ${year}, by Applied Date, current stage`}
      legend={
        <div className="flex flex-wrap items-center gap-3">
          <LegendDot color={APPLICANT_POOL_COLOR} label="Applicant Pool" />
          <LegendDot color={NEW_HIRING_COLOR} label="New Hiring" />
          <LegendDot color={APPROVED_COLOR} label="Approved" />
          <LegendDot color={REJECTED_COLOR} label="Rejected" />
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
          <Bar dataKey="applicantPool" name="Applicant Pool" fill={APPLICANT_POOL_COLOR} radius={[6, 6, 0, 0]} maxBarSize={20} />
          <Bar dataKey="newHiring" name="New Hiring" fill={NEW_HIRING_COLOR} radius={[6, 6, 0, 0]} maxBarSize={20} />
          <Bar dataKey="approved" name="Approved" fill={APPROVED_COLOR} radius={[6, 6, 0, 0]} maxBarSize={20} />
          <Bar dataKey="rejected" name="Rejected" fill={REJECTED_COLOR} radius={[6, 6, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
