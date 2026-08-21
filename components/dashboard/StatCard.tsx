import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "blue" | "emerald" | "rose" | "amber" | "violet";
  subtitle?: string;
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
};

export function StatCard({ label, value, icon: Icon, tone = "blue", subtitle }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", toneClasses[tone])}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none text-foreground">{value}</p>
        </div>
      </div>
      {subtitle && <p className="mt-3 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
