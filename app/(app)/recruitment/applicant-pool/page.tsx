import { PageHeader } from "@/components/layout/PageHeader";
import { ApplicationQrCode } from "@/components/employees/ApplicationQrCode";
import { OnlineRegisterTable } from "@/components/employees/OnlineRegisterTable";
import { getOnlineRegistrations } from "@/lib/online-register-service";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
export const dynamic = "force-dynamic";
export default async function ApplicantPoolPage() {
  const [all, currentUser] = await Promise.all([getOnlineRegistrations(), getCurrentSessionUser()]);
  const registrations = all.filter((r) => (r.accessChannel === "applicant_pool_qr" || r.registrationStatus.toLowerCase() === "applicant_pool") && r.registrationStatus.toLowerCase() !== "approved");
  return <div><PageHeader title="Applicant Pool" description="Kandidat yang masuk melalui satu QR umum Applicant Pool." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Recruitment", href: "/recruitment" }, { label: "Applicant Pool" }]} /><ApplicationQrCode heading="Applicant Pool — QR Umum" description="Gunakan satu QR code ini untuk semua pelamar. Setelah dipindai, pelamar akan melihat homepage PT MOD INDO." canRegenerate={currentUser?.role === "Administrator"} defaultCollapsed /><OnlineRegisterTable registrations={registrations} emptyMessage="No Applicant Pool candidates yet." /></div>;
}
