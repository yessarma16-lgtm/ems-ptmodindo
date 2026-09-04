import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { TimeOverdueReport } from "@/components/reports/TimeOverdueReport";

export default function OverdueEmployeePage() {
  return <div><PageHeader title="Report - Overdue Employee" description="Laporan selisih jam clock-in aktual terhadap jadwal karyawan." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "Overdue Employee" }]} /><Card><CardContent className="pt-4"><TimeOverdueReport /></CardContent></Card></div>;
}
