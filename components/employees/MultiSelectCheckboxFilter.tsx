"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SelectOption } from "@/lib/master-data-options";

interface MultiSelectCheckboxFilterProps {
  label: string;
  options: SelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/** Dropdown checkbox filter for a field with many possible values (e.g. Position) — a single <Select> can only pick one, this picks any combination. */
export function MultiSelectCheckboxFilter({ label, options, selected, onChange, className }: MultiSelectCheckboxFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setSearch("");
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const filteredOptions = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        onClick={() => (open ? close() : setOpen(true))}
        className="w-full justify-between font-normal sm:w-48"
      >
        <span className="truncate">{selected.length > 0 ? `${label} (${selected.length})` : label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </Button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-lg border border-border bg-card p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <Input
              autoFocus
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {selected.length > 0 && (
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" title="Clear" onClick={() => onChange([])}>
                <X className="size-4" />
              </Button>
            )}
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {filteredOptions.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p>}
            {filteredOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
