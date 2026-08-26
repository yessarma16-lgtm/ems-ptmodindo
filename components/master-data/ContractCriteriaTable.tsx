"use client";

import { Pencil, Power, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ContractCriteriaItem } from "@/lib/database/types";

interface ContractCriteriaTableProps {
  items: ContractCriteriaItem[];
  onEdit: (item: ContractCriteriaItem) => void;
  onToggleStatus: (item: ContractCriteriaItem) => void;
  onDelete: (item: ContractCriteriaItem) => void;
  pendingId?: string | null;
}

/** "3 Tahun + 2 Tahun" — human-readable summary of a periods array. */
function formatPeriods(item: ContractCriteriaItem): string {
  if (item.periods.length === 0) return "—";
  return item.periods.map((p) => `${p.value} ${p.unit === "year" ? "Tahun" : "Bulan"}`).join(" + ");
}

export function ContractCriteriaTable({ items, onEdit, onToggleStatus, onDelete, pendingId }: ContractCriteriaTableProps) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No contract criteria available.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Applies To</TableHead>
            <TableHead>Periods</TableHead>
            <TableHead className="w-24">Sort Order</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const active = item.status.toLowerCase() === "active";
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  {item.appliesToStatus ? <Badge variant="outline">{item.appliesToStatus}</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatPeriods(item)}</TableCell>
                <TableCell className="text-muted-foreground">{item.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant={active ? "success" : "secondary"}>{item.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(item)} title="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onToggleStatus(item)}
                      disabled={pendingId === item.id}
                      title={active ? "Deactivate" : "Activate"}
                      className={active ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}
                    >
                      <Power className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(item)}
                      disabled={pendingId === item.id}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
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
