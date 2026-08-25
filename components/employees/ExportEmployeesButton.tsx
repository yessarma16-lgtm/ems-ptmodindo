import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildEmployeeExportQueryString } from "@/lib/employee-list-data";
import type { EmployeeListQuery } from "@/lib/database/types";

/** Icon-only download link — exports the current list view (same filters/sort as on screen) to .xlsx via /api/employees/export. */
export function ExportEmployeesButton({ query }: { query: EmployeeListQuery }) {
  const href = `/api/employees/export?${buildEmployeeExportQueryString(query)}`;
  return (
    <Button type="button" variant="outline" size="icon" asChild title="Export to Excel">
      <a href={href} download>
        <FileSpreadsheet />
      </a>
    </Button>
  );
}
