import { CheckCircle2 } from "lucide-react";

import { ApplicationReceived } from "@/components/employees/ApplicationReceived";
import { ApplyBackground } from "@/components/employees/ApplyBackground";
import { getOnlineRegistrationById } from "@/lib/online-register-service";
import { isDatabaseConfigured } from "@/lib/database/database";
import { getBackgroundImage } from "@/lib/settings-service";
import { buildApplicationId } from "@/lib/application-id";
import { formatDateLong } from "@/lib/date-format";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ rid?: string }>;
}

export default async function WalkInThanksPage({ searchParams }: PageProps) {
  const { rid } = await searchParams;
  const backgroundDataUri = isDatabaseConfigured() ? await getBackgroundImage("apply").catch(() => "") : "";
  const registration = rid && isDatabaseConfigured() ? await getOnlineRegistrationById(rid).catch(() => null) : null;

  if (!registration) {
    return (
      <ApplyBackground backgroundDataUri={backgroundDataUri}>
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <CheckCircle2 className="size-12 text-emerald-600" />
          <h1 className="text-xl font-semibold text-foreground">Thank you — application received</h1>
          <p className="text-sm text-muted-foreground">
            Your application has been submitted and is awaiting review by PT MOD INDO HR.
          </p>
        </div>
      </ApplyBackground>
    );
  }

  return (
    <ApplyBackground backgroundDataUri={backgroundDataUri}>
      <ApplicationReceived
        applicationDate={formatDateLong(registration.submittedAt)}
        applicationId={buildApplicationId(registration.recordId, registration.submittedAt)}
        positionApplied={registration.position}
      />
    </ApplyBackground>
  );
}
