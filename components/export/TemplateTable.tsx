"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, FileOutput, Pencil, Power } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExportTemplateListItem } from "@/lib/export-template-service";
import { formatDateDMY } from "@/lib/date-format";

interface TemplateTableProps {
  templates: ExportTemplateListItem[];
}

function formatDate(iso: string): string {
  const formatted = formatDateDMY(iso);
  return formatted || "—";
}

export function TemplateTable({ templates }: TemplateTableProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleToggleStatus(id: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/export/templates/${id}/toggle-status`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update status.");
        return;
      }
      toast.success(`Template is now ${data.template.status}.`);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/export/templates/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to duplicate template.");
        return;
      }
      toast.success(`Duplicated as "${data.template.name}".`);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (templates.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No export templates yet. Create one to define a reusable export structure.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Template</TableHead>
            <TableHead className="w-24 text-right">Sheets</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-36">Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => {
            const active = template.status.toLowerCase() === "active";
            return (
              <TableRow key={template.id}>
                <TableCell>
                  <p className="font-medium">{template.name}</p>
                  {template.description && (
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{template.sheetCount}</TableCell>
                <TableCell>
                  <Badge variant={active ? "success" : "secondary"}>{template.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(template.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {active && (
                      <Button variant="ghost" size="icon" asChild title="Export">
                        <Link href={`/export?templateId=${template.id}`}>
                          <FileOutput className="size-4" />
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild title="Edit">
                      <Link href={`/export/templates/${template.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Duplicate"
                      disabled={pendingId === template.id}
                      onClick={() => handleDuplicate(template.id)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={active ? "Deactivate" : "Activate"}
                      disabled={pendingId === template.id}
                      onClick={() => handleToggleStatus(template.id)}
                      className={active ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}
                    >
                      <Power className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
