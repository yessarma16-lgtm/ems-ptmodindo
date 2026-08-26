import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { getEmployeeById, type EmployeeRecord } from "@/lib/employee-service";
import { getAllMasterData } from "@/lib/master-data-service";
import { getContractCriteria } from "@/lib/contract-criteria-service";
import { toEmployeeFormMasterData, type EmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import type { ContractCriteriaItem } from "@/lib/database/types";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const configured = isDatabaseConfigured();

  let employee: EmployeeRecord | null = null;
  let connectionError: string | null = null;
  let masterData: EmployeeFormMasterData | null = null;
  let masterDataError: string | null = null;
  let contractCriteria: ContractCriteriaItem[] = [];

  if (configured) {
    try {
      employee = await getEmployeeById(id);
    } catch (err) {
      connectionError =
        err instanceof DatabaseConnectionError ? err.message : "Unable to connect to Employee Database.";
    }

    try {
      masterData = toEmployeeFormMasterData(await getAllMasterData());
    } catch (err) {
      masterDataError =
        err instanceof DatabaseConnectionError ? err.message : "Unable to load master data.";
    }

    try {
      contractCriteria = await getContractCriteria({ activeOnly: true });
    } catch {
      // Non-critical — the CONTRACT CRITERIA dropdown just falls back to empty; the rest of the form still works.
    }
  }

  if (configured && !connectionError && !employee) notFound();

  return (
    <div>
      <PageHeader
        title={employee ? `Edit Employee — ${employee.name || employee.nik}` : "Edit Employee"}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Employees", href: "/employees" },
          ...(employee
            ? [{ label: employee.name || "Employee", href: `/employees/${employee.recordId}` }]
            : []),
          { label: "Edit" },
        ]}
      />
      {!configured && <NotConfiguredNotice />}
      {configured && connectionError && <ConnectionErrorNotice message={connectionError} />}
      {configured && !connectionError && employee && (
        <EmployeeForm
          mode="edit"
          recordId={employee.recordId}
          initialValues={employee}
          masterData={masterData}
          masterDataError={masterDataError}
          contractCriteria={contractCriteria}
          excludeFields={["positionApplied"]}
          deleteConfig={{
            url: `/api/employees/${employee.recordId}`,
            redirectTo: "/employees",
            itemLabel: employee.name || employee.nik,
          }}
        />
      )}
    </div>
  );
}
