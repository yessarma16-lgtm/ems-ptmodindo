import Image from "next/image";
import { CheckCircle2, XCircle } from "lucide-react";

import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { ApplyBackground } from "@/components/employees/ApplyBackground";
import { ApplicationReceived } from "@/components/employees/ApplicationReceived";
import { getOnlineRegistrationById } from "@/lib/online-register-service";
import { getAllMasterData } from "@/lib/master-data-service";
import { toEmployeeFormMasterData, type EmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import { getBackgroundImage } from "@/lib/settings-service";
import { buildApplicationId } from "@/lib/application-id";
import { formatDateLong } from "@/lib/date-format";
import { PUBLIC_APPLY_EXCLUDED_FIELDS, PUBLIC_APPLY_SECTION_ORDER } from "@/config/employee-fields";

export const dynamic = "force-dynamic";

/** POSITION APPLIED (Vacant Position master data) is specific to the Applicant Pool walk-in form — not shown here, where POSITION itself already arrives pre-filled and locked. */
const INVITE_LINK_EXCLUDED_FIELDS = [...PUBLIC_APPLY_EXCLUDED_FIELDS, "positionApplied"];

function StatusScreen({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {icon}
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const registration = await getOnlineRegistrationById(token);
  const backgroundDataUri = isDatabaseConfigured() ? await getBackgroundImage("apply").catch(() => "") : "";

  if (!registration) {
    return (
      <ApplyBackground backgroundDataUri={backgroundDataUri}>
        <StatusScreen
          icon={<XCircle className="size-12 text-destructive" />}
          title="Link not found"
          description="This application link is invalid or has expired. Please contact PT MOD INDO HR for a new link."
        />
      </ApplyBackground>
    );
  }

  if (registration.registrationStatus.toLowerCase() === "approved") {
    return (
      <ApplyBackground backgroundDataUri={backgroundDataUri}>
        <StatusScreen
          icon={<CheckCircle2 className="size-12 text-emerald-600" />}
          title="Application already approved"
          description="This application has already been reviewed and approved. If you have questions, please contact PT MOD INDO HR."
        />
      </ApplyBackground>
    );
  }

  if (registration.registrationStatus.toLowerCase() === "rejected") {
    return (
      <ApplyBackground backgroundDataUri={backgroundDataUri}>
        <StatusScreen
          icon={<XCircle className="size-12 text-destructive" />}
          title="Application already processed"
          description="This application has already been reviewed. If you have questions, please contact PT MOD INDO HR."
        />
      </ApplyBackground>
    );
  }

  if (registration.submittedAt) {
    return (
      <ApplyBackground backgroundDataUri={backgroundDataUri}>
        <ApplicationReceived
          applicationDate={formatDateLong(registration.submittedAt)}
          applicationId={buildApplicationId(registration.recordId, registration.submittedAt)}
          positionApplied={registration.positionApplied || registration.position}
          candidateNumber={registration.candidateNumber}
        />
      </ApplyBackground>
    );
  }

  let masterData: EmployeeFormMasterData | null = null;
  let masterDataError: string | null = null;

  if (isDatabaseConfigured()) {
    try {
      masterData = toEmployeeFormMasterData(await getAllMasterData());
    } catch (err) {
      masterDataError = err instanceof DatabaseConnectionError ? err.message : "Unable to load form data.";
    }
  } else {
    masterDataError = "Application form is temporarily unavailable.";
  }

  return (
    <ApplyBackground backgroundDataUri={backgroundDataUri}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo-mod.jpg" alt="PT MOD INDO" width={44} height={44} className="rounded" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">PT MOD INDO — Employee Application</h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {registration.name}. Please complete the form below to apply for {registration.position}.
            </p>
          </div>
        </div>

        <EmployeeForm
          mode="create"
          initialValues={registration}
          masterData={masterData}
          masterDataError={masterDataError}
          submitUrl={`/api/apply/${token}`}
          redirectTo={`/apply/${token}`}
          successMessage="Application submitted. Thank you!"
          lockedFields={["name", "hpNumber", "position"]}
          excludeFields={INVITE_LINK_EXCLUDED_FIELDS}
          sectionOrder={PUBLIC_APPLY_SECTION_ORDER}
        />
      </div>
    </ApplyBackground>
  );
}
