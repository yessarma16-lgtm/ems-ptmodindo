"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { MangkirReport } from "@/components/reports/MangkirReport";

export default function MangkirReportPage() {
  return (
    <div>
      <PageHeader
        title="Report Mangkir"
        description="Karyawan aktif yang absen tanpa keterangan (Mangkir) hingga menembus ambang batas Surat Panggilan 1 / 2."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "Report Mangkir" }]}
      />
      <Card>
        <CardContent className="pt-6">
          <MangkirReport />
        </CardContent>
      </Card>
    </div>
  );
}
