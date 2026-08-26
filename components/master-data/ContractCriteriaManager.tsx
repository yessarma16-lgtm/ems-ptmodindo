"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContractCriteriaTable } from "@/components/master-data/ContractCriteriaTable";
import { ContractCriteriaDialog, type ContractCriteriaFormValues } from "@/components/master-data/ContractCriteriaDialog";
import type { ContractCriteriaItem } from "@/lib/database/types";
import type { MasterDataItem } from "@/lib/master-data-service";

/** Settings > Master Data > Contract Criteria — same list/create/edit/toggle shape as MasterDataManager, but with a period-based rule (and an "applies to" Contract Status) instead of just Code/Name. */
export function ContractCriteriaManager() {
  const [items, setItems] = useState<ContractCriteriaItem[]>([]);
  const [statusOptions, setStatusOptions] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContractCriteriaItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [criteriaRes, statusRes] = await Promise.all([
        fetch("/api/master-data/contract-criteria", { cache: "no-store" }),
        fetch("/api/master-data/lookup?type=CONTRACT_STATUS", { cache: "no-store" }),
      ]);
      const criteriaData = await criteriaRes.json();
      if (!criteriaRes.ok) throw new Error(criteriaData.error ?? "Unable to load contract criteria.");
      setItems(criteriaData.items ?? []);

      const statusData = await statusRes.json();
      if (statusRes.ok) {
        setStatusOptions((statusData.items ?? []).filter((i: MasterDataItem) => i.status === "Active"));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load contract criteria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  function handleRefresh() {
    setLoading(true);
    load();
  }

  async function handleCreate(values: ContractCriteriaFormValues) {
    const res = await fetch("/api/master-data/contract-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: values.code,
        name: values.name,
        periods: values.periods,
        appliesToStatus: values.appliesToStatus,
        sortOrder: values.sortOrder ? Number(values.sortOrder) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create entry.");
      return;
    }
    toast.success("Contract Criteria entry created.");
    setDialogOpen(false);
    load();
  }

  async function handleEditSubmit(values: ContractCriteriaFormValues) {
    if (!editing) return;
    const res = await fetch(`/api/master-data/contract-criteria/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: values.code,
        name: values.name,
        periods: values.periods,
        appliesToStatus: values.appliesToStatus,
        sortOrder: values.sortOrder ? Number(values.sortOrder) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to update entry.");
      return;
    }
    toast.success("Changes saved.");
    setDialogOpen(false);
    setEditing(null);
    load();
  }

  async function handleToggleStatus(item: ContractCriteriaItem) {
    setPendingId(item.id);
    try {
      const res = await fetch(`/api/master-data/contract-criteria/${item.id}/toggle-status`, { method: "POST" });
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
  function openEditDialog(item: ContractCriteriaItem) {
    setEditing(item);
    setDialogOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RotateCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
        <Button onClick={openCreateDialog}>
          <Plus />
          Add Contract Criteria
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">Unable to load contract criteria.</p>
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
        <ContractCriteriaTable items={items} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} pendingId={pendingId} />
      )}

      <ContractCriteriaDialog
        key={`${editing?.id ?? "new"}-${dialogOpen}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editing ? "edit" : "create"}
        statusOptions={statusOptions}
        initialValues={
          editing
            ? {
                code: editing.code,
                name: editing.name,
                periods: editing.periods,
                appliesToStatus: editing.appliesToStatus,
                sortOrder: String(editing.sortOrder),
              }
            : undefined
        }
        onSubmit={editing ? handleEditSubmit : handleCreate}
      />
    </div>
  );
}
