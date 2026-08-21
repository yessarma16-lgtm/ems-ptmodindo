"use client";

import Image from "next/image";
import { Bell, Menu } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@/lib/user-service";

interface HeaderProps {
  onMenuClick: () => void;
  currentUser: User | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Header({ onMenuClick, currentUser }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <div className="flex items-center gap-2.5">
        <Image src="/logo-mod.jpg" alt="PT MOD INDO" width={28} height={28} className="rounded" />
        <span className="text-lg font-semibold uppercase text-foreground">Employee Management System</span>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <button
          className="relative rounded-full p-2 text-muted-foreground hover:bg-muted"
          aria-label="Notifications"
          type="button"
        >
          <Bell className="size-5" />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
        </button>

        {currentUser && (
          <div className="hidden items-center gap-2.5 border-l border-border pl-4 sm:flex">
            <Avatar>
              <AvatarFallback>{initials(currentUser.name)}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="text-base font-medium">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
