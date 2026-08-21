"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Table2 } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SheetTabBar } from "@/components/export/SheetTabBar";
import { AvailableFieldsPanel } from "@/components/export/AvailableFieldsPanel";
import { SelectedColumnsList } from "@/components/export/SelectedColumnsList";
import { AddStaticColumnDialog } from "@/components/export/AddStaticColumnDialog";
import { EditColumnDialog } from "@/components/export/EditColumnDialog";
import { TemplateStructurePreview } from "@/components/export/TemplateStructurePreview";
import { TemplateDataPreview } from "@/components/export/TemplateDataPreview";
import { EMPLOYEE_FIELDS, getFieldByKey } from "@/config/employee-fields";
import type { ExportTemplateDetail, ExportTemplateColumn } from "@/lib/export-template-service";
import type { EmployeeRecord } from "@/lib/employee-service";

interface TemplateBuilderProps {
  initialTemplate: ExportTemplateDetail;
  previewEmployees: EmployeeRecord[];
}

async function api<T>(url: string, options?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, data };
}

export function TemplateBuilder({ initialTemplate, previewEmployees }: TemplateBuilderProps) {
  const router = useRouter();
  const [template, setTemplate] = useState<ExportTemplateDetail>(initialTemplate);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(initialTemplate.sheets[0]?.id ?? null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerValues, setHeaderValues] = useState({
    name: initialTemplate.name,
    description: initialTemplate.description,
    keyField: initialTemplate.keyField,
  });
  const [addingOther, setAddingOther] = useState(false);
  const [editingColumn, setEditingColumn] = useState<ExportTemplateColumn | null>(null);

  const templateId = template.id;
  const activeSheet = template.sheets.find((s) => s.id === activeSheetId) ?? template.sheets[0] ?? null;

  const usedFieldKeys = useMemo(
    () => new Set((activeSheet?.columns ?? []).map((c) => c.sourceField).filter((v): v is string => !!v)),
    [activeSheet],
  );

  async function refetch() {
    const { ok, data } = await api<{ template: ExportTemplateDetail }>(`/api/export/templates/${templateId}`);
    if (ok) setTemplate(data.template);
    return ok;
  }

  async function handleSaveHeader() {
    setSavingHeader(true);
    const { ok, data } = await api<{ template: ExportTemplateDetail; error?: string }>(
      `/api/export/templates/${templateId}`,
      { method: "PUT", body: JSON.stringify(headerValues) },
    );
    setSavingHeader(false);
    if (!ok) {
      toast.error(data.error ?? "Failed to save template.");
      return;
    }
    toast.success("Template saved.");
    await refetch();
    router.refresh();
  }

  async function handleAddSheet(name: string): Promise<boolean> {
    const { ok, data } = await api<{ sheet: { id: string }; error?: string }>(
      `/api/export/templates/${templateId}/sheets`,
      { method: "POST", body: JSON.stringify({ name }) },
    );
    if (!ok) return false;
    toast.success(`Sheet "${name}" added.`);
    await refetch();
    setActiveSheetId(data.sheet.id);
    return true;
  }

  async function handleRenameSheet(sheetId: string, name: string): Promise<boolean> {
    const { ok } = await api(`/api/export/templates/${templateId}/sheets/${sheetId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    if (!ok) return false;
    toast.success("Sheet renamed.");
    await refetch();
    return true;
  }

  async function handleDeleteSheet(sheetId: string): Promise<boolean> {
    const { ok, data } = await api<{ error?: string }>(`/api/export/templates/${templateId}/sheets/${sheetId}`, {
      method: "DELETE",
    });
    if (!ok) {
      toast.error(data.error ?? "Failed to delete sheet.");
      return false;
    }
    toast.success("Sheet deleted.");
    if (activeSheetId === sheetId) {
      const remaining = template.sheets.filter((s) => s.id !== sheetId);
      setActiveSheetId(remaining[0]?.id ?? null);
    }
    await refetch();
    return true;
  }

  async function handleReorderSheets(orderedIds: string[]) {
    setTemplate((prev) => ({
      ...prev,
      sheets: orderedIds.map((id) => prev.sheets.find((s) => s.id === id)!).filter(Boolean),
    }));
    const { ok } = await api(`/api/export/templates/${templateId}/sheets/reorder`, {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    });
    if (!ok) {
      toast.error("Failed to save sheet order.");
      await refetch();
    }
  }

  async function handleSelectField(fieldKey: string) {
    if (!activeSheet) return;
    if (usedFieldKeys.has(fieldKey)) {
      toast.warning("This field is already used in this sheet.");
    }
    const field = getFieldByKey(fieldKey);
    const { ok, data } = await api<{ error?: string }>(
      `/api/export/templates/${templateId}/sheets/${activeSheet.id}/columns`,
      {
        method: "POST",
        body: JSON.stringify({
          columnType: "FIELD",
          sourceField: fieldKey,
          displayLabel: field?.label ?? fieldKey,
          isKey: fieldKey === template.keyField,
        }),
      },
    );
    if (!ok) {
      toast.error(data.error ?? "Failed to add field.");
      return;
    }
    await refetch();
  }

  async function handleAddBlank() {
    if (!activeSheet) return;
    const { ok, data } = await api<{ error?: string }>(
      `/api/export/templates/${templateId}/sheets/${activeSheet.id}/columns`,
      { method: "POST", body: JSON.stringify({ columnType: "BLANK" }) },
    );
    if (!ok) {
      toast.error(data.error ?? "Failed to add blank column.");
      return;
    }
    await refetch();
  }

  async function handleAddStaticColumn(values: { displayLabel: string; blankValue: string }): Promise<boolean> {
    if (!activeSheet) return false;
    const { ok, data } = await api<{ error?: string }>(
      `/api/export/templates/${templateId}/sheets/${activeSheet.id}/columns`,
      {
        method: "POST",
        body: JSON.stringify({
          columnType: "STATIC",
          displayLabel: values.displayLabel,
          blankValue: values.blankValue,
        }),
      },
    );
    if (!ok) {
      toast.error(data.error ?? "Failed to add column.");
      return false;
    }
    toast.success("Column added.");
    setAddingOther(false);
    await refetch();
    return true;
  }

  async function handleUpdateColumn(values: { displayLabel: string; blankValue?: string }): Promise<boolean> {
    if (!activeSheet || !editingColumn) return false;
    const body: Record<string, string> = { displayLabel: values.displayLabel };
    if (editingColumn.columnType === "STATIC") body.blankValue = values.blankValue ?? "";
    const { ok, data } = await api<{ error?: string }>(
      `/api/export/templates/${templateId}/sheets/${activeSheet.id}/columns/${editingColumn.id}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    if (!ok) {
      toast.error(data.error ?? "Failed to update column.");
      return false;
    }
    toast.success("Column updated.");
    setEditingColumn(null);
    await refetch();
    return true;
  }

  async function handleRemoveColumn(columnId: string) {
    if (!activeSheet) return;
    const { ok, data } = await api<{ error?: string }>(
      `/api/export/templates/${templateId}/sheets/${activeSheet.id}/columns/${columnId}`,
      { method: "DELETE" },
    );
    if (!ok) {
      toast.error(data.error ?? "Failed to remove column.");
      return;
    }
    await refetch();
  }

  async function handleReorderColumns(orderedIds: string[]) {
    if (!activeSheet) return;
    setTemplate((prev) => ({
      ...prev,
      sheets: prev.sheets.map((s) =>
        s.id !== activeSheet.id
          ? s
          : { ...s, columns: orderedIds.map((id) => s.columns.find((c) => c.id === id)!).filter(Boolean) },
      ),
    }));
    const { ok } = await api(`/api/export/templates/${templateId}/sheets/${activeSheet.id}/reorder`, {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    });
    if (!ok) {
      toast.error("Failed to save column order.");
      await refetch();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <Label htmlFor="tpl-name" className="mb-1.5 block">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-name"
              value={headerValues.name}
              onChange={(e) => setHeaderValues((v) => ({ ...v, name: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Label htmlFor="tpl-key" className="mb-1.5 block">
              Employee Key
            </Label>
            <Select
              value={headerValues.keyField}
              onValueChange={(v) => setHeaderValues((val) => ({ ...val, keyField: v }))}
            >
              <SelectTrigger id="tpl-key">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYEE_FIELDS.filter((f) => f.type !== "auto").map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end lg:col-span-1">
            <Button onClick={handleSaveHeader} disabled={savingHeader} className="w-full">
              {savingHeader ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label htmlFor="tpl-desc" className="mb-1.5 block">
              Description
            </Label>
            <Textarea
              id="tpl-desc"
              value={headerValues.description}
              onChange={(e) => setHeaderValues((v) => ({ ...v, description: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="size-4" />
            Sheets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SheetTabBar
            sheets={template.sheets}
            activeSheetId={activeSheet?.id ?? null}
            onSelectSheet={setActiveSheetId}
            onAddSheet={handleAddSheet}
            onRenameSheet={handleRenameSheet}
            onDeleteSheet={handleDeleteSheet}
            onReorderSheets={handleReorderSheets}
          />
        </CardContent>
      </Card>

      {activeSheet ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Available Fields</CardTitle>
              </CardHeader>
              <CardContent className="h-[420px]">
                <AvailableFieldsPanel usedFieldKeys={usedFieldKeys} onSelectField={handleSelectField} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle>
                  Export Columns
                  {activeSheet.columns.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {activeSheet.columns.length}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleAddBlank}>
                    <Plus />
                    Add Blank Column
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddingOther(true)}>
                    <Plus />
                    Add Other Column
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="h-[420px] overflow-y-auto">
                <SelectedColumnsList
                  columns={activeSheet.columns}
                  onReorder={handleReorderColumns}
                  onRemove={handleRemoveColumn}
                  onEdit={setEditingColumn}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="structure">
                <TabsList>
                  <TabsTrigger value="structure">Structure</TabsTrigger>
                  <TabsTrigger value="data">Data Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="structure">
                  <TemplateStructurePreview sheetName={activeSheet.name} columns={activeSheet.columns} />
                </TabsContent>
                <TabsContent value="data">
                  <TemplateDataPreview columns={activeSheet.columns} employees={previewEmployees} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Add a sheet to start building columns.
          </CardContent>
        </Card>
      )}

      <AddStaticColumnDialog open={addingOther} onOpenChange={setAddingOther} onSubmit={handleAddStaticColumn} />
      <EditColumnDialog
        key={editingColumn?.id ?? "no-column"}
        column={editingColumn}
        onOpenChange={(open) => !open && setEditingColumn(null)}
        onSubmit={handleUpdateColumn}
      />
    </div>
  );
}
