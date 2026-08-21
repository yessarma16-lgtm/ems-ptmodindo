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

export interface MasterDataFormValues {
  code: string;
  name: string;
  sortOrder: string;
}

interface MasterDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mode: "create" | "edit";
  initialValues?: Partial<MasterDataFormValues>;
  onSubmit: (values: MasterDataFormValues) => Promise<void>;
}

/**
 * Reusable Add/Edit dialog shared by every Master Data category (Departments,
 * Positions, Levels, Skills, Banks, Lookup).
 *
 * The parent is expected to remount this component (via a `key` that changes
 * whenever the dialog opens for a different item — see MasterDataManager) so
 * its internal form state always starts fresh from `initialValues`, without
 * needing a reset effect.
 */
export function MasterDataDialog({
  open,
  onOpenChange,
  title,
  mode,
  initialValues,
  onSubmit,
}: MasterDataDialogProps) {
  const [values, setValues] = useState<MasterDataFormValues>({
    code: initialValues?.code ?? "",
    name: initialValues?.name ?? "",
    sortOrder: initialValues?.sortOrder ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!values.code.trim()) nextErrors.code = "Code is required.";
    if (!values.name.trim()) nextErrors.name = "Name is required.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? `Add ${title}` : `Edit ${title}`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? `Create a new ${title.toLowerCase()} entry in the Employee Database.`
              : `Update this ${title.toLowerCase()} entry.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="md-code" className="mb-1.5 block">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="md-code"
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
              placeholder="e.g. PROD"
            />
            {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
          </div>

          <div>
            <Label htmlFor="md-name" className="mb-1.5 block">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="md-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="e.g. Production"
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="md-sort" className="mb-1.5 block">
              Sort Order
            </Label>
            <Input
              id="md-sort"
              type="number"
              min={0}
              value={values.sortOrder}
              onChange={(e) => setValues((v) => ({ ...v, sortOrder: e.target.value }))}
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
