import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { ExportEmployeesButton } from "@/components/employees/ExportEmployeesButton";
import { Button } from "@/components/ui/button";
import { loadEmployeeListPageData, parseEmployeeListSearchParams } from "@/lib/employee-list-data";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExpatriateEmployeesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = parseEmployeeListSearchParams(sp, "expatriate");
  const { configured, connectionError, items, total, departmentOptions, contractStatusOptions, statusOptions, positionOptions } =
    await loadEmployeeListPageData(query);

  return (
    <div>
      <PageHeader
        title="Expatriate"
        description="Employees with CATEGORY = Expatriate."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Employees", href: "/employees" },
          { label: "Expatriate" },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <ExportEmployeesButton scope={query.scope} query={query} />
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
            positionOptions={positionOptions}
          />
        </>
      )}
    </div>
  );
}
