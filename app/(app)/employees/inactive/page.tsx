import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { ImportEmployeesDialog } from "@/components/employees/ImportEmployeesDialog";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { loadEmployeeListPageData, parseEmployeeListSearchParams } from "@/lib/employee-list-data";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InactiveEmployeesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = parseEmployeeListSearchParams(sp, "inactive");
  const { configured, connectionError, items, total, departmentOptions, contractStatusOptions, statusOptions } =
    await loadEmployeeListPageData(query);

  return (
    <div>
      <PageHeader
        title="Inactive Employees"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Employees", href: "/employees" },
          { label: "Inactive" },
        ]}
        actions={<ImportEmployeesDialog />}
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
            variant="inactive"
            dateFilterLabel="Resign Date"
          />
        </>
      )}
    </div>
  );
}
