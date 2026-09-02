"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ReportSetup } from "@/components/reports/ReportSetup";

export default function ReportSetupPage() {
  return (
    <div>
      <PageHeader
        title="Report Setup"
        description="Pengaturan untuk halaman Report: ambang batas & penandatangan Surat Panggilan, serta filter OTH Report Time Overdue."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "Report Setup" }]}
      />
      <Card>
        <CardContent className="pt-6">
          <ReportSetup />
        </CardContent>
      </Card>
    </div>
  );
}
