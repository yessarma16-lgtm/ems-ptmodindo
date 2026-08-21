"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateDMY } from "@/lib/date-format";
import type { EmployeeFormMode } from "@/components/employees/EmployeeForm";

export interface ContractPeriodRow {
  /** Stable React key — the real DB record id once persisted, otherwise a client-generated temp id. */
  key: string;
  contractType: string;
  startDate: string;
  endDate: string;
}

interface ContractHistoryEditorProps {
  mode: EmployeeFormMode;
  entries: ContractPeriodRow[];
  onAdd: () => void;
  onChangeField: (key: string, field: "startDate" | "endDate", value: string) => void;
  onRemove: (key: string) => void;
}

export function ContractHistoryEditor({ mode, entries, onAdd, onChangeField, onRemove }: ContractHistoryEditorProps) {
  const readOnly = mode === "view";

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <div className="mb-2 flex items-center justify-between">
        <Label className="mb-0">Contract Periods</Label>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add Period
          </Button>
        )}
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {readOnly ? "No contract periods recorded." : "Fill in JOIN DATE above, or click “Add Period” to start."}
        </p>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Period</Label>
              <p className="text-sm font-medium">{entry.contractType}</p>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Start Date</Label>
              {readOnly ? (
                <p className="text-sm">{formatDateDMY(entry.startDate)}</p>
              ) : (
                <Input
                  type="date"
                  value={entry.startDate}
                  onChange={(e) => onChangeField(entry.key, "startDate", e.target.value)}
                />
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">End Date</Label>
              {readOnly ? (
                <p className="text-sm">{formatDateDMY(entry.endDate)}</p>
              ) : (
                <Input
                  type="date"
                  value={entry.endDate}
                  onChange={(e) => onChangeField(entry.key, "endDate", e.target.value)}
                />
              )}
            </div>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remove this period"
                onClick={() => onRemove(entry.key)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
