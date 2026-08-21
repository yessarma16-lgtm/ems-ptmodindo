import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { OnlineRegisterTable } from "@/components/employees/OnlineRegisterTable";
import { ApplicationQrCode } from "@/components/employees/ApplicationQrCode";
import { getOnlineRegistrations } from "@/lib/online-register-service";
import { getCurrentSessionUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function OnlineRegisterPage() {
  const registrations = await getOnlineRegistrations();
  const currentUser = await getCurrentSessionUser();

  return (
    <div>
      <PageHeader
        title="Online Register"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Recruitment", href: "/recruitment" },
          { label: "Online Register" },
        ]}
        actions={
          <Button asChild>
            <Link href="/recruitment/new">
              <Plus />
              Add Registration
            </Link>
          </Button>
        }
      />

      <ApplicationQrCode canRegenerate={currentUser?.role === "Administrator"} />

      <OnlineRegisterTable registrations={registrations} />
    </div>
  );
}
