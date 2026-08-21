"use client";

import { Pencil, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { MasterDataItem } from "@/lib/master-data-service";

interface MasterDataTableProps {
  items: MasterDataItem[];
  onEdit: (item: MasterDataItem) => void;
  onToggleStatus: (item: MasterDataItem) => void;
  pendingId?: string | null;
  emptyMessage: string;
}

export function MasterDataTable({
  items,
  onEdit,
  onToggleStatus,
  pendingId,
  emptyMessage,
}: MasterDataTableProps) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
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
