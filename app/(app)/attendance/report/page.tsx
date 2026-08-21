"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceReportPanel } from "@/components/attendance/AttendanceReportPanel";

export default function AttendanceReportPage() {
  return (
    <div>
      <PageHeader title="Overtime Report" description="Generate rekap Final OTH dan laporan eksepsi untuk kebutuhan audit HR." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Attendance" }, { label: "Overtime Report" }]} />
      <Card><CardContent className="pt-6"><AttendanceReportPanel /></CardContent></Card>
    </div>
  );
}
