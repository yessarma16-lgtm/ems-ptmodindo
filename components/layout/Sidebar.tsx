"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";

import { MAIN_NAV, FOOTER_NAV, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isDeveloper: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function NavLink({
  href,
  label,
  Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: (typeof MAIN_NAV)[number]["icon"];
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100")}>{label}</span>
    </Link>
  );
}

function ChildLinks({
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  items: NonNullable<NavItem["children"]>;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className={cn("mt-0.5 space-y-0.5", collapsed ? "flex flex-col items-center" : "ml-[27px] border-l border-sidebar-border pl-3")}>
      {items.map((child) => {
        const childActive = pathname === child.href;
        return (
          <Link
            key={child.href}
            href={child.href}
            onClick={onNavigate}
            title={collapsed ? child.label : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors",
              collapsed ? "justify-center px-2" : "px-2.5",
              childActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <child.icon className="size-4 shrink-0" />
            <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100")}>{child.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function NavGroup({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const activeChild = item.children?.some((child) => pathname === child.href || pathname.startsWith(child.href + "/")) ?? false;
  const [expanded, setExpanded] = useState(active);

  if (item.collapsible && item.children) {
    // In minimized mode, keep the active module's submenu icons visible.
    // Labels stay hidden by ChildLinks.
    const showChildren = expanded && !collapsed;
    const showActiveChildren = collapsed && (active || activeChild);
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={collapsed ? item.label : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
            collapsed && "justify-center px-0",
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <item.icon className="size-[18px] shrink-0" />
          <span className={cn("flex-1 overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100")}>{item.label}</span>
          {!collapsed && <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} />}
        </button>
        {(showChildren || showActiveChildren) && <ChildLinks items={item.children} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />}
      </div>
    );
  }

  return (
    <div>
      <NavLink
        href={item.href}
        label={item.label}
        Icon={item.icon}
        active={active && !item.children}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {item.children && !collapsed && (
        <ChildLinks items={item.children} pathname={pathname} collapsed={false} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function SidebarContent({
  collapsed,
  onClose,
  onToggleCollapsed,
  showMobileClose,
  showCollapseToggle,
  isDeveloper,
}: {
  isDeveloper: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed?: () => void;
  showMobileClose: boolean;
  showCollapseToggle: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center gap-2 px-5 py-6", collapsed ? "justify-center px-2" : "justify-between")}>
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white">
            <Image src="/logo-mod.jpg" alt="PT MOD INDO" width={28} height={28} className="rounded" />
          </div>
          {/* text-lg, not text-base — kept at the original (pre-reduction) size deliberately, per explicit request. */}
          <p className={cn("overflow-hidden whitespace-nowrap text-lg font-bold text-white transition-[max-width,opacity] duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100")}>PT MOD INDO</p>
        </div>
        <div className="flex items-center gap-1">
          {showCollapseToggle && onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden rounded-md p-1 text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:block"
              type="button"
            >
              {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          )}
          {showMobileClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-sidebar-muted-foreground hover:bg-sidebar-accent lg:hidden"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto py-2", collapsed ? "px-2" : "px-3")}>
        {MAIN_NAV.map((item) => (
          <NavGroup key={item.href} item={item.label === "Settings" && !isDeveloper ? { ...item, children: item.children?.filter((child) => child.label !== "Database") } : item} pathname={pathname} collapsed={collapsed} onNavigate={onClose} />
        ))}
      </nav>

      <div className={cn("space-y-1 border-t border-sidebar-border py-3", collapsed ? "px-2" : "px-3")}>
        {FOOTER_NAV.map((item) => (
          <NavGroup key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onClose} />
        ))}
        <button
          title={collapsed ? "Logout" : undefined}
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
            collapsed && "justify-center px-0",
          )}
          type="button"
        >
          <LogOut className="size-[18px]" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ mobileOpen, onClose, collapsed, onToggleCollapsed, isDeveloper }: SidebarProps) {
  return (
    <>
      {/* Desktop / tablet persistent sidebar */}
      <aside
        className={cn(
          "hidden lg:block lg:shrink-0 lg:border-r lg:border-sidebar-border lg:transition-[width] lg:duration-200",
          collapsed ? "lg:w-20" : "lg:w-[227px]",
        )}
      >
        <div className="relative sticky top-0 h-screen">
          <SidebarContent
            collapsed={collapsed}
            onClose={onClose}
            onToggleCollapsed={onToggleCollapsed}
            showMobileClose={false}
            showCollapseToggle
            isDeveloper={isDeveloper}
          />
        </div>
      </aside>

      {/* Mobile drawer — always shown fully expanded, regardless of desktop collapse state */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <SidebarContent
              collapsed={false}
              onClose={onClose}
              showMobileClose
              showCollapseToggle={false}
              isDeveloper={isDeveloper}
            />
          </div>
        </div>
      )}
    </>
  );
}
