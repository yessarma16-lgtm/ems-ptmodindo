"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ExportTemplateColumn } from "@/lib/export-template-service";

interface EditColumnDialogProps {
  column: ExportTemplateColumn | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { displayLabel: string; blankValue?: string }) => Promise<boolean>;
}

/** Rename any column's display label; for STATIC columns, also edit the constant value every row will get. */
export function EditColumnDialog({ column, onOpenChange, onSubmit }: EditColumnDialogProps) {
  const [displayLabel, setDisplayLabel] = useState(column?.displayLabel ?? "");
  const [blankValue, setBlankValue] = useState(column?.blankValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isStatic = column?.columnType === "STATIC";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isStatic && !displayLabel.trim()) {
      setError("Column name is required.");
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit({ displayLabel: displayLabel.trim(), blankValue: isStatic ? blankValue : undefined });
    setSubmitting(false);
    if (!ok) setError("Failed to save changes.");
  }

  return (
    <Dialog open={!!column} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Column</DialogTitle>
          <DialogDescription>
            {isStatic
              ? "Rename this column and change the fixed value every exported row will use."
              : "Rename this column's export header."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="col-name" className="mb-1.5 block">
              Column Name {isStatic && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="col-name"
              value={displayLabel}
              onChange={(e) => {
                setDisplayLabel(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Company Name"
              autoFocus
            />
          </div>

          {isStatic && (
            <div>
              <Label htmlFor="col-value" className="mb-1.5 block">
                Value (used for every row)
              </Label>
              <Input
                id="col-value"
                value={blankValue}
                onChange={(e) => setBlankValue(e.target.value)}
                placeholder="e.g. PT MOD INDO"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
