import Link from "next/link";
import { Settings2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { ExportWizard } from "@/components/export/ExportWizard";
import { getTemplates } from "@/lib/export-template-service";
import { getEmployees, type EmployeeRecord } from "@/lib/employee-service";
import { getAllMasterData } from "@/lib/master-data-service";
import { toEmployeeFormMasterData, type SelectOption } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";

export const dynamic = "force-dynamic";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const { templateId } = await searchParams;
  const activeTemplates = (await getTemplates()).filter((t) => t.status.toLowerCase() === "active");

  const configured = isDatabaseConfigured();
  let employees: EmployeeRecord[] = [];
  let connectionError: string | null = null;
  let departmentOptions: SelectOption[] = [];
  let positionOptions: SelectOption[] = [];
  let levelOptions: SelectOption[] = [];
  let statusOptions: SelectOption[] = [];

  if (configured) {
    try {
      employees = await getEmployees();
    } catch (err) {
      connectionError =
        err instanceof DatabaseConnectionError ? err.message : "Unable to connect to Employee Database.";
    }
    try {
      const masterData = toEmployeeFormMasterData(await getAllMasterData());
      departmentOptions = masterData.departments;
      positionOptions = masterData.positions;
      levelOptions = masterData.levels;
      statusOptions = masterData.lookup.EMPLOYEE_STATUS ?? [];
    } catch {
      // Filter options are non-critical — the wizard still works, filters just fall back to "All".
    }
  }

  return (
    <div>
      <PageHeader
        title="Export Employee Data"
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Export" }]}
        actions={
          <Button variant="outline" asChild>
            <Link href="/export/templates">
              <Settings2 />
              Manage Templates
            </Link>
          </Button>
        }
      />

      {!configured && <NotConfiguredNotice />}
      {configured && connectionError && <ConnectionErrorNotice message={connectionError} />}
      {configured && !connectionError && (
        <ExportWizard
          templates={activeTemplates}
          employees={employees}
          departmentOptions={departmentOptions}
          positionOptions={positionOptions}
          levelOptions={levelOptions}
          statusOptions={statusOptions}
          initialTemplateId={templateId}
        />
      )}
    </div>
  );
}
