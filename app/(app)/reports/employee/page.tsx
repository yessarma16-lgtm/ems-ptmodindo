import { FileBarChart2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function EmployeeReportPage() {
  return (
    <div>
      <PageHeader
        title="Employee Report"
        description="Employee reporting."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }, { label: "Employee Report" }]}
      />

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <FileBarChart2 className="size-10" />
          <p className="text-sm">Report content coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
