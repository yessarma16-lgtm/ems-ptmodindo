import { UserCheck, UserPlus, UserX, Clock3, FileClock, CalendarClock } from "lucide-react";

import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import { NewVsResignChart } from "@/components/dashboard/charts/NewVsResignChart";
import { MonthlyHeadcountChart } from "@/components/dashboard/charts/MonthlyHeadcountChart";
import { ContractTypeChart } from "@/components/dashboard/charts/ContractTypeChart";
import { TopDepartmentsChart } from "@/components/dashboard/charts/TopDepartmentsChart";
import { EmployeeTypeChart } from "@/components/dashboard/charts/EmployeeTypeChart";
import { NotConfiguredNotice, ConnectionErrorNotice } from "@/components/layout/ConnectionNotice";
import { loadDashboardData, parseDashboardFilter } from "@/lib/dashboard-service";
import { isDatabaseConfigured } from "@/lib/database/database";
import { DatabaseConnectionError } from "@/lib/database/errors";
import { getCurrentSessionUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filter = parseDashboardFilter(sp);
  const configured = isDatabaseConfigured();
  const user = configured ? await getCurrentSessionUser() : null;

  const periodLabel = filter.month ? "This month" : filter.year ? `In ${filter.year}` : "All time";
  const monthlyHeadcountYear = filter.year || String(new Date().getFullYear());
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const departmentAsOfLabel = filter.year
    ? filter.month
      ? `${MONTH_NAMES[Number(filter.month) - 1]} ${filter.year}`
      : `December ${filter.year}`
    : "Today";

  let connectionError: string | null = null;
  let data: Awaited<ReturnType<typeof loadDashboardData>> | null = null;

  if (configured) {
    try {
      data = await loadDashboardData(filter);
    } catch (err) {
      connectionError = err instanceof DatabaseConnectionError ? err.message : "Unable to connect to Employee Database.";
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <DashboardGreeting name={user?.name ?? "there"} />
        {data && <DashboardFilterBar month={filter.month} year={filter.year} availableYears={data.availableYears} />}
      </div>

      {!configured && <NotConfiguredNotice />}
      {configured && connectionError && <ConnectionErrorNotice message={connectionError} />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Active Employees" value={data.cards.activeEmployees} icon={UserCheck} tone="emerald" subtitle="Current headcount" />
            <StatCard label="New Employees" value={data.cards.newEmployees} icon={UserPlus} tone="blue" subtitle={periodLabel} />
            <StatCard
              label="Inactive / Resigned"
              value={data.cards.resignedEmployees}
              icon={UserX}
              tone="rose"
              subtitle={periodLabel}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Contract Ending This Month"
              value={data.cards.endingThisMonth}
              icon={Clock3}
              tone="rose"
              subtitle="Contract & Probation"
              details={data.cards.endingThisMonthEmployees.map((employee) => ({
                label: employee.name,
                href: `/employees/${employee.recordId}`,
                endDate: employee.endDate,
              }))}
            />
            <StatCard
              label="Contract Ending Next Month"
              value={data.cards.endingNextMonth}
              icon={FileClock}
              tone="amber"
              subtitle="Contract & Probation"
              details={data.cards.endingNextMonthEmployees.map((employee) => ({
                label: employee.name,
                href: `/employees/${employee.recordId}`,
                endDate: employee.endDate,
              }))}
            />
            <StatCard
              label="Contract Ending Next 2 Months"
              value={data.cards.endingNext2Months}
              icon={CalendarClock}
              tone="violet"
              subtitle="Contract & Probation"
              details={data.cards.endingNext2MonthsEmployees.map((employee) => ({
                label: employee.name,
                href: `/employees/${employee.recordId}`,
                endDate: employee.endDate,
              }))}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <NewVsResignChart data={data.newVsResignByMonth} year={monthlyHeadcountYear} />
            <MonthlyHeadcountChart data={data.monthlyHeadcount} year={monthlyHeadcountYear} />
            <ContractTypeChart data={data.contractTypeByMonth} year={monthlyHeadcountYear} />
            <TopDepartmentsChart data={data.topDepartments} periodLabel={departmentAsOfLabel} />
            <div className="xl:col-span-2">
              <EmployeeTypeChart data={data.employeeTypes} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
