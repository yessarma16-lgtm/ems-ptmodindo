import Link from "next/link";
import { ArrowRight, UsersRound, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OnlineRegisterPage() {
  return (
    <div>
      <PageHeader
        title="Recruitment"
        description="Pilih alur recruitment yang ingin dikelola."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Recruitment" },
        ]}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5" /> New Hiring</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Kelola kandidat dari proses New Hiring, verifikasi NIK, dan approval.</p><Button asChild><Link href="/recruitment/new-hiring">Open New Hiring <ArrowRight /></Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="size-5" /> Applicant Pool</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Kelola kandidat yang masuk melalui Applicant Pool QR.</p><Button asChild><Link href="/recruitment/applicant-pool">Open Applicant Pool <ArrowRight /></Link></Button></CardContent></Card>
      </div>
    </div>
  );
}
