import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getFieldByKey } from "@/config/employee-fields";
import type { ExportTemplateColumn } from "@/lib/export-template-service";
import type { EmployeeRecord } from "@/lib/employee-service";

interface TemplateDataPreviewProps {
  columns: ExportTemplateColumn[];
  employees: EmployeeRecord[];
}

/**
 * Optional live-data preview (a handful of real SQLite rows run through the
 * column config) — purely visual, never writes a file. Blank columns render
 * truly empty cells, exactly as they would in a real export.
 */
export function TemplateDataPreview({ columns, employees }: TemplateDataPreviewProps) {
  if (columns.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Add columns to see a data preview.</p>;
  }
  if (employees.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No employees in the database yet — add one to see a live preview.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const field = column.sourceField ? getFieldByKey(column.sourceField) : undefined;
              const label = column.displayLabel?.trim() || field?.label || column.sourceField;
              return <TableHead key={column.id}>{column.columnType === "BLANK" ? "" : label}</TableHead>;
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.recordId}>
              {columns.map((column) => (
                <TableCell key={column.id}>
                  {column.columnType === "BLANK"
                    ? ""
                    : column.columnType === "STATIC"
                      ? column.blankValue || <span className="text-muted-foreground">—</span>
                      : (column.sourceField ? employee[column.sourceField] : "") || (
                          <span className="text-muted-foreground">—</span>
                        )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
