"use client";

import { useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import type { User } from "@/lib/user-service";
import { isDeveloperUser } from "@/lib/auth/developer-access";
import { CalculationSessionProvider } from "@/components/attendance/CalculationSession";

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

export function AppShell({ children, currentUser }: { children: React.ReactNode; currentUser: User | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1") {
      queueMicrotask(() => setCollapsed(true));
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        isDeveloper={isDeveloperUser(currentUser)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} currentUser={currentUser} />
        <CalculationSessionProvider>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </CalculationSessionProvider>
      </div>
    </div>
  );
}
