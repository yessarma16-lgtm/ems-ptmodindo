"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { ALL_EMPLOYEE_FORM_FIELDS } from "@/config/employee-fields";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface AvailableFieldsPanelProps {
  /** Field keys already used at least once in the active sheet — shown checked, not disabled (duplicates are allowed). */
  usedFieldKeys: Set<string>;
  onSelectField: (fieldKey: string) => void;
}

/** Searchable list of every Employee field (config/employee-fields.ts) an admin can add as an export column. */
export function AvailableFieldsPanel({ usedFieldKeys, onSelectField }: AvailableFieldsPanelProps) {
  const [search, setSearch] = useState("");

  const fields = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...ALL_EMPLOYEE_FORM_FIELDS].sort((a, b) => a.tabOrder - b.tabOrder);
    if (!q) return sorted;
    return sorted.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search field..."
          className="pl-9"
        />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {fields.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No fields match &quot;{search}&quot;.</p>
        )}
        {fields.map((field) => {
          const used = usedFieldKeys.has(field.key);
          return (
            <label
              key={field.key}
              htmlFor={`avail-${field.key}`}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                id={`avail-${field.key}`}
                checked={used}
                onCheckedChange={() => onSelectField(field.key)}
              />
              <Label htmlFor={`avail-${field.key}`} className="flex-1 cursor-pointer font-normal">
                {field.label}
              </Label>
            </label>
          );
        })}
      </div>
    </div>
  );
}
