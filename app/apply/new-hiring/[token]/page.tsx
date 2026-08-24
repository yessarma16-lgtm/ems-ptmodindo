import Image from "next/image";
import { XCircle } from "lucide-react";

import { NewHiringApplication } from "@/components/employees/NewHiringApplication";
import { ApplyBackground } from "@/components/employees/ApplyBackground";
import { getAllMasterData } from "@/lib/master-data-service";
import { toEmployeeFormMasterData, type EmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";
import { getNewHiringApplyToken, getBackgroundImage } from "@/lib/settings-service";
import { DatabaseConnectionError } from "@/lib/database/errors";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated — landing page for the New Hiring QR code.
 * `token` must match the current settings.new_hiring_apply_token so a
 * "Regenerate" invalidates old codes, same mechanism as /apply/walkin/[token].
 */
export default async function PublicNewHiringPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: newForm } = await searchParams;
  const currentToken = isDatabaseConfigured() ? await getNewHiringApplyToken() : "";
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
    } catch (error) {
      masterDataError = error instanceof DatabaseConnectionError ? error.message : "Unable to load form data.";
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
            <h1 className="text-lg font-semibold text-foreground">PT MOD INDO - Employment Application</h1>
            <p className="text-sm text-muted-foreground">Please Review Your Application</p>
          </div>
        </div>
        <NewHiringApplication
          token={token}
          masterData={masterData}
          masterDataError={masterDataError}
          initialNewForm={newForm === "1"}
        />
      </div>
    </ApplyBackground>
  );
}
