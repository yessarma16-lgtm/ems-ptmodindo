"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EyeOff, Loader2, Lock, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PERMISSION_MODULES, normalizeModulePermissions, type ModulePermissions, type AccessLevel } from "@/config/module-permissions";
import { FULL_ACCESS_ROLE } from "@/config/user-roles";
import type { RoleAccess } from "@/lib/role-access-service";
import { cn } from "@/lib/utils";

export function RoleAccessManager() {
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [draft, setDraft] = useState<Record<string, ModulePermissions>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/role-access", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to load role access.");
      const list: RoleAccess[] = data.roles ?? [];
      setRoles(list);
      setDraft(Object.fromEntries(list.map((r) => [r.role, r.permissions])));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load role access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  function setLevel(role: string, moduleKey: string, level: AccessLevel) {
    setDraft((d) => ({
      ...d,
      [role]: normalizeModulePermissions({ ...d[role], [moduleKey]: level }),
    }));
  }

  async function handleSave(role: string) {
    setSavingRole(role);
    try {
      const res = await fetch(`/api/role-access/${encodeURIComponent(role)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draft[role] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save role access.");
        return;
      }
      toast.success(`${role} access saved.`);
      load();
    } finally {
      setSavingRole(null);
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive">Unable to load role access.</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {roles.map((r) => {
        const locked = r.role === FULL_ACCESS_ROLE;
        return (
        <Card key={r.role}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {locked ? <Lock className="size-4 text-muted-foreground" /> : <ShieldCheck className="size-4 text-primary" />}
              {r.role}
            </CardTitle>
            {locked && (
              <p className="text-xs text-muted-foreground">Selalu akses penuh ke semua module — tidak bisa diubah.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-1">
            {PERMISSION_MODULES.map((mod) => {
              const level = locked ? "edit" : draft[r.role]?.[mod.key];
              return (
                <div key={mod.key} className={cn("flex items-center justify-between gap-3 rounded-md px-1 py-1.5", locked && "opacity-60")}>
                  <span className="text-sm">{mod.label}</span>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setLevel(r.role, mod.key, "edit")}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                        level === "edit" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setLevel(r.role, mod.key, "view")}
                      className={cn(
                        "border-l border-border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                        level === "view" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      View Only
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setLevel(r.role, mod.key, "hidden")}
                      title="Hide this page from this role entirely"
                      className={cn(
                        "flex items-center gap-1 border-l border-border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                        level === "hidden" ? "bg-destructive text-destructive-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <EyeOff className="size-3" />
                      Hidden
                    </button>
                  </div>
                </div>
              );
            })}
            {!locked && (
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => handleSave(r.role)}
                disabled={savingRole === r.role}
              >
                {savingRole === r.role ? <Loader2 className="animate-spin" /> : <Save />}
                Save {r.role}
              </Button>
            )}
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
