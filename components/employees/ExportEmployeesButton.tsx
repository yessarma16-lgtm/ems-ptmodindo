import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EmployeeListQuery, EmployeeListScope } from "@/lib/database/types";

/**
 * Icon-only download link — exports every employee in this scope
 * (Active/Inactive/Expatriate) with the full ~60-field record (not just what
 * the on-screen table shows), and matching the current
 * search/department/status/position/contract/date-range filter state when
 * `query` is passed — same query params EmployeeTable's URL carries.
 */
export function ExportEmployeesButton({ scope, query }: { scope: EmployeeListScope; query?: EmployeeListQuery }) {
  const params = new URLSearchParams();
  params.set("scope", scope);
  if (query) {
    if (query.search) params.set("q", query.search);
    if (query.department) params.set("dept", query.department);
    if (query.status) params.set("status", query.status);
    for (const p of query.position) params.append("position", p);
    if (query.contractStatus) params.set("contract", query.contractStatus);
    if (query.dateFrom) params.set("from", query.dateFrom);
    if (query.dateTo) params.set("to", query.dateTo);
  }
  const href = `/api/employees/export?${params.toString()}`;
  return (
    <Button type="button" variant="outline" size="icon" asChild title="Export to Excel">
      <a href={href} download>
        <FileSpreadsheet />
      </a>
    </Button>
  );
}
