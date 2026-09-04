import { PageHeader } from "@/components/layout/PageHeader";
import { HrReportCenter } from "@/components/reports/HrReportCenter";

export default function HrReportPage() {
  return <div><PageHeader title="HR Report Center" description="Laporan HR terintegrasi dari database karyawan." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "HR Report Center" }]} /><HrReportCenter /></div>;
}
