"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AttendanceDatePicker({ value, onChange, processedDates = [] }: { value: string; onChange: (value: string) => void; processedDates?: string[] }) {
  const initial = value ? new Date(`${value}T00:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [open, setOpen] = useState(false);
  const processed = useMemo(() => new Set(processedDates), [processedDates]);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  const label = value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "Select date";

  return <div className="relative">
    <Button type="button" variant="outline" className="h-9 w-[145px] justify-start font-normal" onClick={() => setOpen((current) => !current)}><CalendarDays className="size-4" />{label}</Button>
    {open && <div className="absolute left-0 top-10 z-30 w-64 rounded-lg border border-border bg-popover p-3 shadow-md">
      <div className="mb-2 flex items-center justify-between"><Button size="icon" variant="ghost" className="size-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button><span className="text-sm font-medium">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span><Button size="icon" variant="ghost" className="size-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">{days.map((day, index) => { if (!day) return <span key={`empty-${index}`} />; const date = new Date(month.getFullYear(), month.getMonth(), day); const iso = isoDate(date); return <button key={iso} type="button" className={`relative mx-auto flex size-7 items-center justify-center rounded-full text-xs hover:bg-muted ${value === iso ? "bg-primary text-primary-foreground" : ""} ${processed.has(iso) && value !== iso ? "ring-2 ring-green-500 ring-offset-1" : ""}`} onClick={() => { onChange(iso); setOpen(false); }}>{day}</button>; })}</div>
      <div className="mt-2 text-[10px] text-muted-foreground"><span className="mr-1 inline-block size-2 rounded-full bg-green-500" />Already processed</div>
    </div>}
  </div>;
}
