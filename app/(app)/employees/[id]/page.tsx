import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeView } from "@/components/employees/EmployeeView";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { getEmployeeById, type EmployeeRecord } from "@/lib/employee-service";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const configured = isDatabaseConfigured();

  let employee: EmployeeRecord | null = null;
  let connectionError: string | null = null;

  if (configured) {
    try {
      employee = await getEmployeeById(id);
    } catch (err) {
      connectionError =
        err instanceof DatabaseConnectionError ? err.message : "Unable to connect to Employee Database.";
    }
  }

  if (configured && !connectionError && !employee) notFound();

  return (
    <div>
      <PageHeader
        title={employee?.name || "Employee Detail"}
        description={employee?.nik ? `NIK: ${employee.nik}` : undefined}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Employees", href: "/employees" },
          { label: employee?.name || "Detail" },
        ]}
      />
      {!configured && <NotConfiguredNotice />}
      {configured && connectionError && <ConnectionErrorNotice message={connectionError} />}
      {configured && !connectionError && employee && <EmployeeView employee={employee} />}
    </div>
  );
}
