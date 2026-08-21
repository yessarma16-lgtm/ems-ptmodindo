"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { EMPLOYEE_FIELDS } from "@/config/employee-fields";

export default function NewExportTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keyField, setKeyField] = useState("nik");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Template name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/export/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), keyField }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create template.");
        setSubmitting(false);
        return;
      }
      toast.success("Template created.");
      router.push(`/export/templates/${data.template.id}/edit`);
    } catch {
      toast.error("Unable to connect to the database.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Create Export Template"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Export", href: "/export" },
          { label: "Templates", href: "/export/templates" },
          { label: "New" },
        ]}
      />

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="name" className="mb-1.5 block">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. BPJS Monthly"
                autoFocus
              />
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            </div>

            <div>
              <Label htmlFor="description" className="mb-1.5 block">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — what this export is used for"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="keyField" className="mb-1.5 block">
                Employee Key
              </Label>
              <Select value={keyField} onValueChange={setKeyField}>
                <SelectTrigger id="keyField" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_FIELDS.filter((f) => f.type !== "auto").map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Identifies which employee each exported row belongs to. Defaults to NIK.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : <Save />}
                Save Template
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
