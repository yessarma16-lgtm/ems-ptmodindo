import { CheckCircle2 } from "lucide-react";
import { ApplyBackground } from "@/components/employees/ApplyBackground";
import { ApplicationReceived } from "@/components/employees/ApplicationReceived";
import { getOnlineRegistrationById } from "@/lib/online-register-service";
import { buildApplicationId } from "@/lib/application-id";
import { formatDateLong } from "@/lib/date-format";
import { isDatabaseConfigured } from "@/lib/database/database";

export default async function NewHiringThanksPage({ searchParams }: { searchParams: Promise<{ rid?: string }> }) {
  const { rid } = await searchParams;
  const registration = rid && isDatabaseConfigured() ? await getOnlineRegistrationById(rid).catch(() => null) : null;
  return <ApplyBackground backgroundDataUri="">{registration ? <ApplicationReceived applicationDate={formatDateLong(registration.submittedAt)} applicationId={buildApplicationId(registration.recordId, registration.submittedAt)} positionApplied={registration.position} candidateNumber={registration.candidateNumber} /> : <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center"><CheckCircle2 className="size-12 text-emerald-600" /><h1 className="text-xl font-semibold text-foreground">Thank you - application received</h1><p className="text-sm text-muted-foreground">Your application has been submitted and is awaiting review by PT MOD INDO HR.</p></div>}</ApplyBackground>;
}
