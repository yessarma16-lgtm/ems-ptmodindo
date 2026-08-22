import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TemplateTable } from "@/components/export/TemplateTable";
import { getTemplates } from "@/lib/export-template-service";

export const dynamic = "force-dynamic";

export default async function ExportTemplatesPage() {
  const templates = await getTemplates();

  return (
    <div>
      <PageHeader
        title="Export Templates"
        description="Define reusable export structures — sheets, columns, and field mapping. Admin-controlled, no code required."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Export", href: "/export" },
          { label: "Templates" },
        ]}
        actions={
          <Button asChild>
            <Link href="/export/templates/new">
              <Plus />
              Create Template
            </Link>
          </Button>
        }
      />
      <TemplateTable templates={templates} />
    </div>
  );
}
