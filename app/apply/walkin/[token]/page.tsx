import Image from "next/image";
import { ArrowRight, XCircle } from "lucide-react";

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
 * POSITION is superseded on this specific form by POSITION
 * APPLIED (sourced from Vacant Position master data, see
 * config/employee-fields.ts) — hidden here only, not on New Hiring or the
 * invite-link flow, which still use the plain PUBLIC_APPLY_EXCLUDED_FIELDS.
 */
const WALKIN_EXCLUDED_FIELDS = [...PUBLIC_APPLY_EXCLUDED_FIELDS, "position"];

/**
 * Public, unauthenticated — landing page for the fixed walk-in QR code
 * printed on posters/flyers. Unlike /apply/[token] (one link per candidate,
 * pre-filled and locked), this is fully open: anyone who scans it fills in
 * the entire form themselves. `token` must match the current
 * settings.public_apply_token so a "Regenerate" invalidates old codes.
 */
export default async function WalkInApplyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ form?: string }> }) {
  const { token } = await params;
  const { form } = await searchParams;
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

  if (form !== "1") {
    return <ApplyBackground backgroundDataUri={backgroundDataUri}>
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6 py-10">
        <div className="w-full rounded-2xl border border-border/80 bg-card/95 p-8 text-center shadow-xl backdrop-blur-sm sm:p-10">
          <Image src="/logo-mod.jpg" alt="Logo PT MOD INDO" width={112} height={112} className="mx-auto rounded-2xl shadow-sm" priority />
          <p className="mt-7 text-sm font-semibold uppercase tracking-[0.2em] text-primary">PT MOD INDO</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">Selamat Datang</h1>
          <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-muted-foreground">
            Terima kasih atas ketertarikan Anda untuk bergabung bersama PT MOD INDO. Silakan isi formulir lamaran dengan lengkap dan benar.
          </p>
          <a
            href={`/apply/walkin/${token}?form=1`}
            className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Isi Formulir
            <ArrowRight className="size-5" />
          </a>
        </div>
      </main>
    </ApplyBackground>;
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
            <h1 className="text-lg font-semibold text-foreground">PT MOD INDO - Pra-Employment Application</h1>
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
          excludeFields={WALKIN_EXCLUDED_FIELDS}
          sectionOrder={PUBLIC_APPLY_SECTION_ORDER}
        />
      </div>
    </ApplyBackground>
  );
}
