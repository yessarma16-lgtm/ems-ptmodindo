"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save, ShieldCheck, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PERMISSION_MODULES,
  allHiddenModulePermissions,
  sanitizePartialPermissions,
  type ModulePermissions,
  type AccessLevel,
} from "@/config/module-permissions";
import { FULL_ACCESS_ROLE } from "@/config/user-roles";
import type { RoleAccess } from "@/lib/role-access-service";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  override: Partial<ModulePermissions>;
}

type RowChoice = AccessLevel | "inherit";

const LEVEL_LABEL: Record<AccessLevel, string> = { edit: "Edit", view: "View Only", hidden: "Hidden" };

export function IndividualAccessManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<Partial<ModulePermissions>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user-access", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to load individual access.");
      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load individual access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const isFullAccessRole = selected?.role === FULL_ACCESS_ROLE;

  const baseline: ModulePermissions = useMemo(() => {
    if (!selected) return allHiddenModulePermissions();
    return roles.find((r) => r.role === selected.role)?.permissions ?? allHiddenModulePermissions();
  }, [selected, roles]);

  function selectUser(id: string) {
    setSelectedId(id);
    const u = users.find((x) => x.id === id);
    setDraft(u ? { ...u.override } : {});
  }

  function setChoice(key: keyof ModulePermissions, choice: RowChoice) {
    setDraft((d) => {
      const next = { ...d };
      if (choice === "inherit") delete next[key];
      else next[key] = choice;
      return next;
    });
  }

  const overrideCount = Object.keys(sanitizePartialPermissions(draft)).length;
  const dirty = useMemo(() => {
    if (!selected) return false;
    const a = sanitizePartialPermissions(draft);
    const b = sanitizePartialPermissions(selected.override);
    if (Object.keys(a).length !== Object.keys(b).length) return true;
    return PERMISSION_MODULES.some((m) => a[m.key] !== b[m.key]);
  }, [draft, selected]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/user-access/${encodeURIComponent(selected.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: sanitizePartialPermissions(draft) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save individual access.");
        return;
      }
      toast.success(`Akses ${selected.username} disimpan.`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function overrideCountFor(u: UserRow) {
    return Object.keys(sanitizePartialPermissions(u.override)).length;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive">Unable to load individual access.</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Atur akses per orang. Setiap module bisa <span className="font-medium text-foreground">Ikut Role</span> (default) atau
        di-override jadi Edit / View Only / Hidden. Override berlaku 2 arah — bisa menambah maupun mengurangi akses dari role-nya.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">User</label>
        <Select value={selectedId} onValueChange={selectUser}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Pilih user…" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => {
              const n = overrideCountFor(u);
              return (
                <SelectItem key={u.id} value={u.id}>
                  {u.username} — {u.role}
                  {n > 0 ? ` (${n} override)` : ""}
                  {u.status.toLowerCase() !== "active" ? " · Inactive" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {!selected ? (
        <p className="text-sm text-muted-foreground">Pilih user untuk mengatur aksesnya.</p>
      ) : isFullAccessRole ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" />
              {selected.name} · {selected.role}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Role <span className="font-medium text-foreground">{FULL_ACCESS_ROLE}</span> selalu punya akses penuh ke semua
              module dan tidak bisa diatur per user. Ganti role user ini dulu di tab User Management kalau mau membatasi
              aksesnya.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <UserCog className="size-4 text-primary" />
                {selected.name} · <span className="text-muted-foreground">{selected.username}</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                Role dasar: {selected.role} · {overrideCount} override
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {PERMISSION_MODULES.map((mod) => {
              const roleLevel = baseline[mod.key];
              const choice: RowChoice = draft[mod.key] ?? "inherit";
              const effective: AccessLevel = draft[mod.key] ?? roleLevel;
              const overridden = choice !== "inherit";
              return (
                <div
                  key={mod.key}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-1.5",
                    overridden && "bg-amber-50",
                  )}
                >
                  <div className="min-w-[220px]">
                    <span className="text-sm">{mod.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      role: {LEVEL_LABEL[roleLevel]}
                      {overridden && <span className="ml-1 font-medium text-amber-700">→ {LEVEL_LABEL[effective]}</span>}
                    </span>
                  </div>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    {(["inherit", "edit", "view", "hidden"] as const).map((opt, i) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setChoice(mod.key, opt)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium transition-colors",
                          i > 0 && "border-l border-border",
                          choice === opt
                            ? opt === "hidden"
                              ? "bg-destructive text-destructive-foreground"
                              : opt === "inherit"
                                ? "bg-muted-foreground/15 text-foreground"
                                : "bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {opt === "inherit" ? "Ikut Role" : LEVEL_LABEL[opt]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft({})}
                disabled={saving || overrideCount === 0}
              >
                <RotateCcw className="size-4" />
                Reset semua ke role
              </Button>
              <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Simpan {selected.username}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
