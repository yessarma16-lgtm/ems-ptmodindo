import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { getAllMasterData } from "@/lib/master-data-service";
import { getContractCriteria } from "@/lib/contract-criteria-service";
import { toEmployeeFormMasterData, type EmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import type { ContractCriteriaItem } from "@/lib/database/types";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  let masterData: EmployeeFormMasterData | null = null;
  let masterDataError: string | null = null;
  let contractCriteria: ContractCriteriaItem[] = [];

  if (isDatabaseConfigured()) {
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
  } else {
    masterDataError = "Employee Database connection is not configured.";
  }

  return (
    <div>
      <PageHeader
        title="Add Employee"
        description="Fill in the Employee Master data below. Fields marked * are required."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Employees", href: "/employees" },
          { label: "Add Employee" },
        ]}
      />
      <EmployeeForm
        mode="create"
        masterData={masterData}
        masterDataError={masterDataError}
        contractCriteria={contractCriteria}
        excludeFields={["positionApplied"]}
      />
    </div>
  );
}
