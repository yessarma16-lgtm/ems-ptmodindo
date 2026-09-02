"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, QrCode, Search, Link2, Trash2 } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OnlineRegistration } from "@/lib/online-register-service";
import { formatDateDMY, formatTimeHM } from "@/lib/date-format";

interface OnlineRegisterTableProps {
  registrations: OnlineRegistration[];
  emptyMessage?: string;
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" | "secondary" {
  const s = status.toLowerCase();
  if (s === "approved") return "success";
  if (s === "pending") return "warning";
  if (s === "rejected") return "destructive";
  if (s === "sent") return "default";
  return "secondary";
}

function SourcePlatformBadge({ sourcePlatform }: { sourcePlatform: string }) {
  if (sourcePlatform === "walkin") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
        <QrCode className="size-3.5" />
        Walk-in
      </span>
    );
  }
  if (sourcePlatform === "direct_link") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 dark:text-sky-400">
        <Link2 className="size-3.5" />
        Direct Link
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function formatAppliedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateDMY(iso)}, ${formatTimeHM(iso)}`;
}

/** Same table look as the Employees list, so Online Register reads as one consistent module. */
export function OnlineRegisterTable({ registrations, emptyMessage = "No registrations yet." }: OnlineRegisterTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OnlineRegistration | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => `${r.name} ${r.email} ${r.positionApplied} ${r.position}`.toLowerCase().includes(q));
  }, [registrations, search]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/online-register/${deleteTarget.recordId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete this registration.");
        return;
      }
      toast.success("Registration deleted.");
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or position..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">SN</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Candidate No.</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>HP Number</TableHead>
              <TableHead>Applied Position</TableHead>
              <TableHead>Source Platform</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r, idx) => (
              <TableRow key={r.recordId}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.candidateNumber || "—"}</TableCell>
                <TableCell>{r.email}</TableCell>
                <TableCell>{r.hpNumber}</TableCell>
                <TableCell>{r.positionApplied || r.position}</TableCell>
                <TableCell>
                  <SourcePlatformBadge sourcePlatform={r.sourcePlatform} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatAppliedAt(r.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.registrationStatus)}>{r.registrationStatus}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" asChild title="Edit">
                    <Link href={`/recruitment/${r.recordId}`}>
                      <Pencil className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Showing {filtered.length} of {registrations.length} registrations
        </p>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this registration?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  This permanently removes <span className="font-medium text-foreground">{deleteTarget.name || "this candidate"}</span>&apos;s
                  registration. {deleteTarget.registrationStatus.toLowerCase() === "approved"
                    ? "They were already approved, so their Employee record is not affected — only this registration entry is deleted."
                    : "This cannot be undone."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
