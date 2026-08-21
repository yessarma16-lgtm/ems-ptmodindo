"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { CalculationPanel } from "@/components/attendance/CalculationPanel";

export default function AttendanceCalculationPage() {
  return (
    <div>
      <PageHeader title="MPP Attendance Calculation" description="Jalankan crosscheck, lihat hasil perhitungan, dan koreksi final OTH secara manual." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Attendance" }, { label: "MPP Attendance Calculation" }]} />
      <Card><CardContent className="pt-6"><CalculationPanel /></CardContent></Card>
    </div>
  );
}
