"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ContractPeriodRule } from "@/lib/database/types";

export interface ContractCriteriaFormValues {
  code: string;
  name: string;
  periods: ContractPeriodRule[];
  sortOrder: string;
}

interface ContractCriteriaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValues?: Partial<ContractCriteriaFormValues>;
  onSubmit: (values: ContractCriteriaFormValues) => Promise<void>;
}

let periodKeySeq = 0;
function nextPeriodKey() {
  periodKeySeq += 1;
  return periodKeySeq;
}

/**
 * Add/Edit dialog for a Contract Criteria entry — a Code/Name plus a
 * repeatable list of sequential periods (e.g. "3 + 2" = a 3-year period
 * followed by a 2-year period). See lib/contract-dates.ts
 * (calculateContractPeriodDates) for how `periods` is consumed.
 */
export function ContractCriteriaDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSubmit,
}: ContractCriteriaDialogProps) {
  const [code, setCode] = useState(initialValues?.code ?? "");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [sortOrder, setSortOrder] = useState(initialValues?.sortOrder ?? "");
  const [periods, setPeriods] = useState<{ key: number; value: string; unit: "month" | "year" }[]>(
    () =>
      (initialValues?.periods && initialValues.periods.length > 0
        ? initialValues.periods
        : [{ value: 1, unit: "year" as const }]
      ).map((p) => ({ key: nextPeriodKey(), value: String(p.value), unit: p.unit })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function addPeriod() {
    setPeriods((prev) => [...prev, { key: nextPeriodKey(), value: "1", unit: "year" }]);
  }
  function removePeriod(key: number) {
    setPeriods((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev));
  }
  function updatePeriod(key: number, patch: Partial<{ value: string; unit: "month" | "year" }>) {
    setPeriods((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!code.trim()) nextErrors.code = "Code is required.";
    if (!name.trim()) nextErrors.name = "Name is required.";
    const parsedPeriods: ContractPeriodRule[] = [];
    for (const p of periods) {
      const n = Number(p.value);
      if (!Number.isInteger(n) || n <= 0) {
        nextErrors.periods = "Every period needs a whole number greater than 0.";
        break;
      }
      parsedPeriods.push({ value: n, unit: p.unit });
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ code, name, periods: parsedPeriods, sortOrder });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Contract Criteria" : "Edit Contract Criteria"}</DialogTitle>
          <DialogDescription>
            Each period runs one after another from JOIN DATE — e.g. 3 years then 2 more years fills CONTRACT
            CLOSE-FIRST and CONTRACT CLOSE-SECOND.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="cc-code" className="mb-1.5 block">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. CONT = 3 + 2"
            />
            {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
          </div>

          <div>
            <Label htmlFor="cc-name" className="mb-1.5 block">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contract 3+2 years" />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          <div>
            <Label className="mb-1.5 block">
              Periods <span className="text-destructive">*</span>
            </Label>
            <div className="space-y-2">
              {periods.map((p, idx) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">
                    {idx === 0 ? "Period 1" : `+ Period ${idx + 1}`}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={p.value}
                    onChange={(e) => updatePeriod(p.key, { value: e.target.value })}
                    className="w-20"
                  />
                  <Select value={p.unit} onValueChange={(v) => updatePeriod(p.key, { unit: v as "month" | "year" })}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Bulan</SelectItem>
                      <SelectItem value="year">Tahun</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePeriod(p.key)}
                    disabled={periods.length <= 1}
                    title="Remove period"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            {errors.periods && <p className="mt-1 text-xs text-destructive">{errors.periods}</p>}
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addPeriod}>
              <Plus />
              Add Period
            </Button>
          </div>

          <div>
            <Label htmlFor="cc-sort" className="mb-1.5 block">
              Sort Order
            </Label>
            <Input
              id="cc-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="1"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {mode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
