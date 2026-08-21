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

interface AddStaticColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { displayLabel: string; blankValue: string }) => Promise<boolean>;
}

/** "Add Other Column" — a custom column whose free-text value is used as-is for every exported row. */
export function AddStaticColumnDialog({ open, onOpenChange, onSubmit }: AddStaticColumnDialogProps) {
  const [displayLabel, setDisplayLabel] = useState("");
  const [blankValue, setBlankValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setDisplayLabel("");
    setBlankValue("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!displayLabel.trim()) {
      setError("Column name is required.");
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit({ displayLabel: displayLabel.trim(), blankValue });
    setSubmitting(false);
    if (ok) {
      reset();
    } else {
      setError("Failed to add column.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Other Column</DialogTitle>
          <DialogDescription>
            Give it a name and a value — every exported row will use this exact same value.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-col-name" className="mb-1.5 block">
              Column Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-col-name"
              value={displayLabel}
              onChange={(e) => {
                setDisplayLabel(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Company Name"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="new-col-value" className="mb-1.5 block">
              Value (used for every row)
            </Label>
            <Input
              id="new-col-value"
              value={blankValue}
              onChange={(e) => setBlankValue(e.target.value)}
              placeholder="e.g. PT MOD INDO"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Add Column
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
