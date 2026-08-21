import { KeyRound } from "lucide-react";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getFieldByKey } from "@/config/employee-fields";
import type { ExportTemplateColumn } from "@/lib/export-template-service";

interface TemplateStructurePreviewProps {
  sheetName: string;
  columns: ExportTemplateColumn[];
}

/** Structural preview only — "No. / Column / Source" — never generates a file. */
export function TemplateStructurePreview({ sheetName, columns }: TemplateStructurePreviewProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">Sheet: {sheetName}</p>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">No.</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No columns in this sheet yet.
                </TableCell>
              </TableRow>
            )}
            {columns.map((column, idx) => {
              const isBlank = column.columnType === "BLANK";
              const isStatic = column.columnType === "STATIC";
              const field = column.sourceField ? getFieldByKey(column.sourceField) : undefined;
              const label = column.displayLabel?.trim() || field?.label || column.sourceField;
              return (
                <TableRow key={column.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    {isBlank ? (
                      <span className="italic text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {label}
                        {isStatic && (
                          <span className="text-xs font-normal text-muted-foreground">
                            = {column.blankValue ? `"${column.blankValue}"` : <em>empty</em>}
                          </span>
                        )}
                        {column.isKey && <KeyRound className="size-3 text-primary" />}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isBlank || isStatic ? "secondary" : "outline"}>
                      {isBlank ? "BLANK" : isStatic ? "STATIC" : "Employee"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
