"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MasterDataTable } from "@/components/master-data/MasterDataTable";
import { MasterDataDialog, type MasterDataFormValues } from "@/components/master-data/MasterDataDialog";
import { LOOKUP_TYPES } from "@/config/master-data-sheets";
import type { MasterDataItem } from "@/lib/master-data-service";

interface MasterDataManagerProps {
  /** URL-safe category id: "departments" | "positions" | "levels" | "skills" | "banks" | "lookup". */
  category: string;
  title: string;
}

export function MasterDataManager({ category, title }: MasterDataManagerProps) {
  const isLookup = category === "lookup";
  const [selectedType, setSelectedType] = useState(isLookup ? LOOKUP_TYPES[0].type : "");
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MasterDataItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const currentTypeLabel = LOOKUP_TYPES.find((t) => t.type === selectedType)?.label ?? title;

  // Deliberately no setState before the first `await` — a synchronous
  // setState call inside an effect (even via a called function) triggers
  // cascading renders. `loading` already starts `true`, and the type
  // switcher / Refresh button set it explicitly from their event handlers.
  const load = useCallback(async () => {
    try {
      const url = isLookup
        ? `/api/master-data/lookup?type=${encodeURIComponent(selectedType)}`
        : `/api/master-data/${category}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to load master data.");
      setItems(data.items ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load master data.");
    } finally {
      setLoading(false);
    }
  }, [category, isLookup, selectedType]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  function handleTypeChange(type: string) {
    setLoading(true);
    setSelectedType(type);
  }

  function handleRefresh() {
    setLoading(true);
    load();
  }

  async function handleCreate(values: MasterDataFormValues) {
    const body = {
      code: values.code,
      name: values.name,
      sortOrder: values.sortOrder ? Number(values.sortOrder) : undefined,
      ...(isLookup ? { type: selectedType } : {}),
    };
    const res = await fetch(`/api/master-data/${category}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create item.");
      return;
    }
    toast.success(`${isLookup ? currentTypeLabel : title} entry created.`);
    setDialogOpen(false);
    load();
  }

  async function handleEditSubmit(values: MasterDataFormValues) {
    if (!editing) return;
    const body = {
      code: values.code,
      name: values.name,
      sortOrder: values.sortOrder ? Number(values.sortOrder) : undefined,
    };
    const res = await fetch(`/api/master-data/${category}/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to update item.");
      return;
    }
    toast.success("Changes saved.");
    setDialogOpen(false);
    setEditing(null);
    load();
  }

  async function handleToggleStatus(item: MasterDataItem) {
    setPendingId(item.id);
    try {
      const res = await fetch(`/api/master-data/${category}/${item.id}/toggle-status`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update status.");
        return;
      }
      toast.success(`${item.name} is now ${data.item.status}.`);
      load();
    } finally {
      setPendingId(null);
    }
  }

  function openCreateDialog() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEditDialog(item: MasterDataItem) {
    setEditing(item);
    setDialogOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isLookup && (
            <Select value={selectedType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOKUP_TYPES.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RotateCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus />
          Add {isLookup ? currentTypeLabel : title}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">Unable to load master data.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <MasterDataTable
          items={items}
          onEdit={openEditDialog}
          onToggleStatus={handleToggleStatus}
          pendingId={pendingId}
          emptyMessage={`No ${(isLookup ? currentTypeLabel : title).toLowerCase()} available.`}
        />
      )}

      <MasterDataDialog
        key={`${editing?.id ?? "new"}-${dialogOpen}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={isLookup ? currentTypeLabel : title}
        mode={editing ? "edit" : "create"}
        initialValues={
          editing
            ? { code: editing.code, name: editing.name, sortOrder: String(editing.sortOrder) }
            : undefined
        }
        onSubmit={editing ? handleEditSubmit : handleCreate}
      />
    </div>
  );
}
