import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { OnlineRegisterTable } from "@/components/employees/OnlineRegisterTable";
import { NewHiringQrCode } from "@/components/employees/NewHiringQrCode";
import { getOnlineRegistrations } from "@/lib/online-register-service";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
export const dynamic = "force-dynamic";
export default async function NewHiringPage() {
  const [all, currentUser] = await Promise.all([getOnlineRegistrations(), getCurrentSessionUser()]);
  const registrations = all.filter((r) => r.accessChannel !== "applicant_pool_qr" && r.registrationStatus.toLowerCase() !== "applicant_pool" && r.registrationStatus.toLowerCase() !== "approved");
  return <div><PageHeader title="New Hiring" description="Kandidat dari proses New Hiring." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Recruitment", href: "/recruitment" }, { label: "New Hiring" }]} actions={<Button asChild><Link href="/recruitment/new"><Plus /> Add Registration</Link></Button>} /><NewHiringQrCode canRegenerate={currentUser?.role === "Administrator"} /><OnlineRegisterTable registrations={registrations} emptyMessage="No New Hiring candidates yet." /></div>;
}
