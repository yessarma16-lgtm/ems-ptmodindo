import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { TemplateBuilder } from "@/components/export/TemplateBuilder";
import { getTemplateById } from "@/lib/export-template-service";
import { getEmployees } from "@/lib/employee-service";

export const dynamic = "force-dynamic";

export default async function EditExportTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) notFound();

  const employees = await getEmployees();

  return (
    <div>
      <PageHeader
        title={template.name}
        description={`Employee key: ${template.keyField.toUpperCase()}`}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Export", href: "/export" },
          { label: "Templates", href: "/export/templates" },
          { label: template.name },
        ]}
      />
      <TemplateBuilder initialTemplate={template} previewEmployees={employees.slice(0, 5)} />
    </div>
  );
}
