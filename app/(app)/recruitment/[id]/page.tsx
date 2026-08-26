import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { RegistrationDecisionCard } from "@/components/employees/RegistrationDecisionCard";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { getOnlineRegistrationById, type OnlineRegistration } from "@/lib/online-register-service";
import { getAllMasterData } from "@/lib/master-data-service";
import { getContractCriteria } from "@/lib/contract-criteria-service";
import { toEmployeeFormMasterData, type EmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import type { ContractCriteriaItem } from "@/lib/database/types";

export const dynamic = "force-dynamic";

export default async function EditOnlineRegistrationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const configured = isDatabaseConfigured();

  let registration: OnlineRegistration | null = null;
  let connectionError: string | null = null;
  let masterData: EmployeeFormMasterData | null = null;
  let masterDataError: string | null = null;
  let contractCriteria: ContractCriteriaItem[] = [];

  if (configured) {
    try {
      registration = await getOnlineRegistrationById(id);
    } catch (err) {
      connectionError =
        err instanceof DatabaseConnectionError ? err.message : "Unable to connect to Employee Database.";
    }
    try {
      masterData = toEmployeeFormMasterData(await getAllMasterData());
    } catch (err) {
      masterDataError = err instanceof DatabaseConnectionError ? err.message : "Unable to load master data.";
    }
    try {
      contractCriteria = await getContractCriteria({ activeOnly: true });
    } catch {
      // Non-critical — the CONTRACT CRITERIA dropdown just falls back to empty; the rest of the form still works.
    }
  }

  if (configured && !connectionError && !registration) notFound();

  return (
    <div>
      <PageHeader
        title={registration ? `Edit Registration — ${registration.name || registration.nik}` : "Edit Registration"}
        description="Same form as Active Employees — fill in the required fields, then Approve or Reject below."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Recruitment", href: "/recruitment" },
          { label: "Edit" },
        ]}
      />
      {!configured && <NotConfiguredNotice />}
      {configured && connectionError && <ConnectionErrorNotice message={connectionError} />}
      {configured && !connectionError && registration && (
        <>
          <RegistrationDecisionCard recordId={registration.recordId} registrationStatus={registration.registrationStatus} />
          <EmployeeForm
            mode="edit"
            recordId={registration.recordId}
            initialValues={registration}
            masterData={masterData}
            masterDataError={masterDataError}
            contractCriteria={contractCriteria}
            submitUrl={`/api/online-register/${registration.recordId}`}
            successMessage="Registration updated."
            showContractPeriods
            stayOnPage
            hrReview
            excludeFields={["positionApplied"]}
          />
        </>
      )}
    </div>
  );
}
