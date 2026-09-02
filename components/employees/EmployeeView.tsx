"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, UserX } from "lucide-react";

import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { EmployeeRecord } from "@/lib/employee-service";

interface EmployeeViewProps {
  employee: EmployeeRecord;
}

/** Read-only Employee detail — reuses EmployeeForm (in "view" mode) so field layout always stays in sync. */
export function EmployeeView({ employee }: EmployeeViewProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isInactive = employee.status?.toLowerCase() === "inactive";

  function handleDeactivate() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/employees/${employee.recordId}/deactivate`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to deactivate employee.");
          return;
        }
        toast.success("Employee deactivated.");
        setConfirmOpen(false);
        router.refresh();
      } catch {
        toast.error("Unable to connect to Employee Database.");
      }
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-end gap-2">
        {isInactive && <Badge variant="destructive">Inactive</Badge>}
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft />
          Back
        </Button>
        {!isInactive && (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <UserX />
            Deactivate
          </Button>
        )}
        <Button asChild>
          <Link href={`/employees/${employee.recordId}/edit`}>
            <Pencil />
            Edit Employee
          </Link>
        </Button>
      </div>

      <EmployeeForm mode="view" recordId={employee.recordId} initialValues={employee} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {employee.name || "this employee"}?</DialogTitle>
            <DialogDescription>
              This sets STATUS to &quot;Inactive&quot; and stamps EXIT DATE in the Employee
              Database. This is not a permanent delete — the record stays in the spreadsheet and
              can be edited again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <UserX />}
              Deactivate Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
