import { PageHeader } from "@/components/layout/PageHeader";
import { GenerateRegistrationLinkForm } from "@/components/employees/GenerateRegistrationLinkForm";
import { getAllMasterData } from "@/lib/master-data-service";
import { toEmployeeFormMasterData } from "@/lib/master-data-options";
import { isDatabaseConfigured } from "@/lib/database/database";

export const dynamic = "force-dynamic";

export default async function NewOnlineRegistrationPage() {
  let positionOptions: ReturnType<typeof toEmployeeFormMasterData>["positions"] = [];
  if (isDatabaseConfigured()) {
    try {
      positionOptions = toEmployeeFormMasterData(await getAllMasterData()).positions;
    } catch {
      // Master data unavailable — the form falls back to a plain text Position input.
    }
  }

  return (
    <div>
      <PageHeader
        title="Add Registration"
        description="Generate a shareable application link for a candidate. Fill in their Name, HP Number, and Position, then send them the link — they'll complete the rest of the application themselves."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Recruitment", href: "/recruitment" },
          { label: "Online Register", href: "/recruitment" },
          { label: "Add Registration" },
        ]}
      />
      <GenerateRegistrationLinkForm positionOptions={positionOptions} />
    </div>
  );
}
