import type { EmployeeRecord, DashboardStats } from "@/lib/database/types";

/**
 * Pure aggregation over already-loaded employees — identical logic for
 * every provider, so it lives here once instead of being duplicated in
 * each adapter.
 */
export function computeDashboardStats(employees: EmployeeRecord[]): DashboardStats {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  let active = 0;
  let contract = 0;
  let permanent = 0;
  let newHires = 0;
  let exited = 0;

  for (const e of employees) {
    const status = (e.status || "").toLowerCase();
    const type = (e.type || "").toLowerCase();

    if (status === "resigned" || status === "terminated") {
      exited++;
    } else if (status !== "inactive") {
      active++;
    }

    if (type === "contract") contract++;
    if (type === "permanent") permanent++;

    if (e.joinDate) {
      const joined = new Date(e.joinDate);
      if (!Number.isNaN(joined.getTime()) && joined >= thirtyDaysAgo && joined <= now) {
        newHires++;
      }
    }
  }

  return {
    totalEmployees: employees.length,
    activeEmployees: active,
    contractEmployees: contract,
    permanentEmployees: permanent,
    newEmployees: newHires,
    exitedEmployees: exited,
  };
}
