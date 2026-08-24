"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { MasterDataManager } from "@/components/master-data/MasterDataManager";

export default function VacantPositionPage() {
  return (
    <div>
      <PageHeader
        title="Vacant Position"
        description="Positions currently open for hiring — powers the Position Applied dropdown on the Applicant Pool form."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Recruitment", href: "/recruitment" },
          { label: "Vacant Position" },
        ]}
      />

      <Card>
        <CardContent className="pt-6">
          <MasterDataManager category="vacantPositions" title="Vacant Position" />
        </CardContent>
      </Card>
    </div>
  );
}
