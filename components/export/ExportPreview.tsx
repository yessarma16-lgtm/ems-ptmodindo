"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ExportRequestBody } from "@/components/export/ExportWizard";

export interface ExportPreviewSheet {
  name: string;
  columns: { label: string; columnType: "FIELD" | "BLANK" | "STATIC"; isKey: boolean }[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

export interface ExportPreviewResponse {
  templateName: string;
  employeeCount: number;
  sheets: ExportPreviewSheet[];
}

interface ExportPreviewProps {
  preview: ExportPreviewResponse;
  requestBody: ExportRequestBody;
  onBack: () => void;
}

/** Downloads a same-origin POST response as a file — no third-party host, no data leaves the app. */
async function downloadBlobResponse(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportPreview({ preview, requestBody, onBack }: ExportPreviewProps) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (generating) return; // guards against double-click firing two generate requests
    setGenerating(true);
    try {
      const res = await fetch("/api/export/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to generate Excel file.");
        return;
      }
      await downloadBlobResponse(res, `${preview.templateName}.xlsx`);
      toast.success("Excel file generated.");
    } catch {
      toast.error("Failed to generate Excel file.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Template</p>
            <p className="font-medium">{preview.templateName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Employees</p>
            <p className="font-medium">{preview.employeeCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sheets</p>
            <p className="font-medium">{preview.sheets.length}</p>
          </div>
        </div>

        {preview.employeeCount === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No employees match the selected criteria.
          </p>
        ) : (
          <Tabs defaultValue={preview.sheets[0]?.name}>
            <TabsList className="flex-wrap">
              {preview.sheets.map((sheet) => (
                <TabsTrigger key={sheet.name} value={sheet.name}>
                  {sheet.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {preview.sheets.map((sheet) => (
              <TabsContent key={sheet.name} value={sheet.name}>
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {sheet.columns.map((col, idx) => (
                          <TableHead key={idx}>
                            {col.label}
                            {col.isKey && (
                              <Badge variant="outline" className="ml-1.5 text-xs">
                                Key
                              </Badge>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sheet.rows.map((row, rowIdx) => (
                        <TableRow key={rowIdx}>
                          {row.map((cell, cellIdx) => (
                            <TableCell key={cellIdx}>{cell}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {sheet.truncated && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first {sheet.rows.length} of {sheet.totalRows} rows.
                  </p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="outline" onClick={onBack} disabled={generating}>
            <ArrowLeft />
            Back
          </Button>
          <Button onClick={handleGenerate} disabled={generating || preview.employeeCount === 0}>
            {generating ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
            {generating ? "Generating Excel..." : "Generate Excel"}
            {!generating && <Download className="size-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
