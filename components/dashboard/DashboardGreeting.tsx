"use client";

import { useEffect, useState } from "react";

/** Computed client-side so it reflects the viewer's own local time, not the server's. */
function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 15) return "Good afternoon";
  if (hour < 18) return "Good evening";
  return "Good night";
}

export function DashboardGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setGreeting(greetingForHour(new Date().getHours())));
  }, []);

  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {greeting ?? "Welcome"}, {name} <span aria-hidden>👋</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Here&apos;s a summary of your employee data today.</p>
    </div>
  );
}
