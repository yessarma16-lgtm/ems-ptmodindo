"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RegistrationDecisionCardProps {
  recordId: string;
  registrationStatus: string;
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" | "secondary" {
  const s = status.toLowerCase();
  if (s === "approved") return "success";
  if (s === "pending") return "warning";
  if (s === "rejected") return "destructive";
  if (s === "sent") return "default";
  return "secondary";
}

/** Approve converts this draft into a real Employee (Active list); Reject just marks it Rejected. Both are final. */
export function RegistrationDecisionCard({ recordId, registrationStatus }: RegistrationDecisionCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const status = registrationStatus.toLowerCase();
  const isPending = status === "pending";
  const isSent = status === "sent";

  async function handleApprove() {
    setPending("approve");
    try {
      const res = await fetch(`/api/online-register/${recordId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to approve this registration.");
        return;
      }
      toast.success("Approved — moved to Active Employees.");
      router.push(`/employees/${data.employeeRecordId}`);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handleReject() {
    setPending("reject");
    try {
      const res = await fetch(`/api/online-register/${recordId}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to reject this registration.");
        return;
      }
      toast.success("Registration rejected.");
      router.push("/recruitment");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Registration Status</CardTitle>
        <Badge variant={statusVariant(registrationStatus)}>{registrationStatus}</Badge>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={handleApprove}
              disabled={pending !== null}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {pending === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Approve — Move to Active Employees
            </Button>
            <Button type="button" variant="destructive" onClick={handleReject} disabled={pending !== null}>
              {pending === "reject" ? <Loader2 className="animate-spin" /> : <XCircle />}
              Reject
            </Button>
          </div>
        ) : isSent ? (
          <p className="text-sm text-muted-foreground">
            The application link has been sent — waiting for the candidate to fill it in and submit.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This registration has already been {status} — no further action needed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
