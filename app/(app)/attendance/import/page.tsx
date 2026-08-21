"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AttendanceImportPanel } from "@/components/attendance/AttendanceImportPanel";
import { BracketMasterManager } from "@/components/attendance/BracketMasterManager";

export default function AttendanceImportPage() {
  return (
    <div>
      <PageHeader
        title="NK Attendance Data"
        description="Import raw attendance data and manage the interval duration table used by the overtime rule engine."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Attendance" },
          { label: "NK Attendance Data" },
        ]}
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="import">
            <TabsList>
              <TabsTrigger value="import">Attendance Data Import</TabsTrigger>
              <TabsTrigger value="bracket">Interval Duration Master</TabsTrigger>
            </TabsList>
            <TabsContent value="import">
              <AttendanceImportPanel />
            </TabsContent>
            <TabsContent value="bracket">
              <BracketMasterManager />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
