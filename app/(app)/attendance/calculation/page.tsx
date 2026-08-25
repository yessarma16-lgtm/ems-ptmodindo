"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { CalculationPanel } from "@/components/attendance/CalculationPanel";

export default function AttendanceCalculationPage() {
  return (
    <div>
      <PageHeader title="MPP Attendance Calculation" description="Run the crosscheck, review calculation results, and manually correct EDIT OTH." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Attendance" }, { label: "MPP Attendance Calculation" }]} />
      <Card><CardContent className="pt-6"><CalculationPanel /></CardContent></Card>
    </div>
  );
}
