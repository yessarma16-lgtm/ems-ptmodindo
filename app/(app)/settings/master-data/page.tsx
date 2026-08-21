"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MasterDataManager } from "@/components/master-data/MasterDataManager";

const TABS: { value: string; label: string }[] = [
  { value: "departments", label: "Departments" },
  { value: "positions", label: "Positions" },
  { value: "levels", label: "Levels" },
  { value: "skills", label: "Skills" },
  { value: "banks", label: "Banks" },
  { value: "lookup", label: "Lookup" },
];

export default function MasterDataPage() {
  return (
    <div>
      <PageHeader
        title="Master Data"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Master Data" },
        ]}
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="departments">
            <TabsList className="flex-wrap">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <MasterDataManager category={tab.value} title={tab.label} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
