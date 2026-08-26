"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateDMY } from "@/lib/date-format";
import type { SelectOption } from "@/lib/master-data-options";
import type { EmployeeFormMode } from "@/components/employees/EmployeeForm";

const MOVEMENT_TYPES = ["Promosi", "Demosi", "Mutasi", "Permanent"] as const;

export interface EmployeeMovementRow {
  /** Stable React key — the real DB record id once persisted, otherwise a client-generated temp id. */
  key: string;
  movementType: string;
  effectiveDate: string;
  lastDepartment: string;
  lastPosition: string;
  newDepartment: string;
  newPosition: string;
}

type MovementField = "movementType" | "effectiveDate" | "lastDepartment" | "lastPosition" | "newDepartment" | "newPosition";

interface EmployeeMovementHistoryEditorProps {
  mode: EmployeeFormMode;
  entries: EmployeeMovementRow[];
  departmentOptions: SelectOption[];
  positionOptions: SelectOption[];
  onAdd: () => void;
  onChangeField: (key: string, field: MovementField, value: string) => void;
  onRemove: (key: string) => void;
}

export function EmployeeMovementHistoryEditor({
  mode,
  entries,
  departmentOptions,
  positionOptions,
  onAdd,
  onChangeField,
  onRemove,
}: EmployeeMovementHistoryEditorProps) {
  const readOnly = mode === "view";

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      {!readOnly && (
        <div className="mb-2 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add Movement
          </Button>
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {readOnly ? "No movement recorded." : "Click “Add Movement” to record a promotion, demotion, or transfer."}
        </p>
      )}

      <div className="space-y-3">
        {entries.map((entry) => {
          // The auto-logged "Permanent" entry mirrors Contract Status +
          // Permanen Date — it must stay read-only here so it can't drift
          // from those fields; edit Contract Information instead.
          const isAutoPermanent = entry.movementType === "Permanent";
          const rowReadOnly = readOnly || isAutoPermanent;
          return (
          <div key={entry.key} className="space-y-3 rounded-lg border border-border p-3">
            {isAutoPermanent && !readOnly && (
              <p className="text-xs text-muted-foreground">
                Auto-logged from Contract Information (Contract Status + Permanen Date). To change it, edit those fields instead.
              </p>
            )}
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Movement Type</Label>
                {rowReadOnly ? (
                  <p className="text-sm font-medium">{entry.movementType}</p>
                ) : (
                  <Select value={entry.movementType} onValueChange={(v) => onChangeField(entry.key, "movementType", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOVEMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Effective Date</Label>
                {rowReadOnly ? (
                  <p className="text-sm">{formatDateDMY(entry.effectiveDate)}</p>
                ) : (
                  <Input
                    type="date"
                    value={entry.effectiveDate}
                    onChange={(e) => onChangeField(entry.key, "effectiveDate", e.target.value)}
                  />
                )}
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={isAutoPermanent ? "Remove this auto-logged entry (it will be re-logged on the next save if Contract Status is still Permanent)" : "Remove this movement"}
                  onClick={() => onRemove(entry.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-3 rounded-md border border-border/60 p-2.5">
                <p className="text-xs font-medium text-muted-foreground">Last</p>
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Department</Label>
                  {rowReadOnly ? (
                    <p className="text-sm">{entry.lastDepartment || "—"}</p>
                  ) : (
                    <Select value={entry.lastDepartment} onValueChange={(v) => onChangeField(entry.key, "lastDepartment", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Position</Label>
                  {rowReadOnly ? (
                    <p className="text-sm">{entry.lastPosition || "—"}</p>
                  ) : (
                    <Select value={entry.lastPosition} onValueChange={(v) => onChangeField(entry.key, "lastPosition", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        {positionOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-md border border-border/60 p-2.5">
                <p className="text-xs font-medium text-muted-foreground">New</p>
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Department</Label>
                  {rowReadOnly ? (
                    <p className="text-sm">{entry.newDepartment || "—"}</p>
                  ) : (
                    <Select value={entry.newDepartment} onValueChange={(v) => onChangeField(entry.key, "newDepartment", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Position</Label>
                  {rowReadOnly ? (
                    <p className="text-sm">{entry.newPosition || "—"}</p>
                  ) : (
                    <Select value={entry.newPosition} onValueChange={(v) => onChangeField(entry.key, "newPosition", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        {positionOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
