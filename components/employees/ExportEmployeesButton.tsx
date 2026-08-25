import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EmployeeListScope } from "@/lib/database/types";

/** Icon-only download link — exports EVERY employee in this scope (Active/Inactive/Expatriate) with the full ~60-field record, not just what the on-screen table shows or the current search/filter state. */
export function ExportEmployeesButton({ scope }: { scope: EmployeeListScope }) {
  const href = `/api/employees/export?scope=${scope}`;
  return (
    <Button type="button" variant="outline" size="icon" asChild title="Export to Excel">
      <a href={href} download>
        <FileSpreadsheet />
      </a>
    </Button>
  );
}
