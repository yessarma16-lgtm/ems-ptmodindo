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
        description="Import data absensi mentah dan kelola tabel Durasi Jam antara yang dipakai rule engine overtime."
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
              <TabsTrigger value="import">Import Data Absensi</TabsTrigger>
              <TabsTrigger value="bracket">Master Durasi Jam antara</TabsTrigger>
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
