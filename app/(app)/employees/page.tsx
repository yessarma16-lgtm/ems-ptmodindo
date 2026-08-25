import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { ImportEmployeesDialog } from "@/components/employees/ImportEmployeesDialog";
import { ExportEmployeesButton } from "@/components/employees/ExportEmployeesButton";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { Button } from "@/components/ui/button";
import { loadEmployeeListPageData, parseEmployeeListSearchParams } from "@/lib/employee-list-data";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = parseEmployeeListSearchParams(sp, "active");
  const { configured, connectionError, items, total, departmentOptions, contractStatusOptions, statusOptions } =
    await loadEmployeeListPageData(query);

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Employee Master data."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Employees" }]}
        actions={
          <div className="flex items-center gap-3">
            <ExportEmployeesButton query={query} />
            <ImportEmployeesDialog />
            <Button asChild>
              <Link href="/employees/new">
                <Plus />
                Add Employee
              </Link>
            </Button>
          </div>
        }
      />

      {!configured ? (
        <NotConfiguredNotice />
      ) : connectionError ? (
        <ConnectionErrorNotice message={connectionError} />
      ) : (
        <>
          <EmployeeTable
            items={items}
            total={total}
            query={query}
            departmentOptions={departmentOptions}
            contractStatusOptions={contractStatusOptions}
            statusOptions={statusOptions}
            dateFilterLabel="Join Date"
          />
        </>
      )}
    </div>
  );
}
