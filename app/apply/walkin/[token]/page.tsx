import Image from "next/image";
import { XCircle } from "lucide-react";

import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { ApplyBackground } from "@/components/employees/ApplyBackground";
import { getPublicApplyToken, getBackgroundImage } from "@/lib/settings-service";
import { getAllMasterData } from "@/lib/master-data-service";
import { toEmployeeFormMasterData, type EmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import { PUBLIC_APPLY_EXCLUDED_FIELDS, PUBLIC_APPLY_SECTION_ORDER } from "@/config/employee-fields";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated — landing page for the fixed walk-in QR code
 * printed on posters/flyers. Unlike /apply/[token] (one link per candidate,
 * pre-filled and locked), this is fully open: anyone who scans it fills in
 * the entire form themselves. `token` must match the current
 * settings.public_apply_token so a "Regenerate" invalidates old codes.
 */
export default async function WalkInApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const currentToken = isDatabaseConfigured() ? await getPublicApplyToken() : "";
  const backgroundDataUri = isDatabaseConfigured() ? await getBackgroundImage("apply").catch(() => "") : "";

  if (!currentToken || token !== currentToken) {
    return (
      <ApplyBackground backgroundDataUri={backgroundDataUri}>
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <XCircle className="size-12 text-destructive" />
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="text-sm text-muted-foreground">
            This application link is no longer valid. Please scan the current QR code, or contact PT MOD INDO HR.
          </p>
        </div>
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
            <p className="text-sm text-muted-foreground">Please complete the form below to apply.</p>
          </div>
        </div>

        <EmployeeForm
          mode="create"
          masterData={masterData}
          masterDataError={masterDataError}
          submitUrl={`/api/apply/walkin/${token}`}
          redirectTo="/apply/walkin/thanks"
          successMessage="Application submitted. Thank you!"
          excludeFields={PUBLIC_APPLY_EXCLUDED_FIELDS}
          sectionOrder={PUBLIC_APPLY_SECTION_ORDER}
        />
      </div>
    </ApplyBackground>
  );
}
