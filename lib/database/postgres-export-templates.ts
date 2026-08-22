import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { RecordNotFoundError } from "@/lib/database/errors";
import type {
  ColumnType,
  ExportTemplate,
  ExportTemplateListItem,
  ExportTemplateDetail,
  ExportTemplateSheet,
  ExportTemplateSheetWithColumns,
  ExportTemplateColumn,
  TemplateInput,
  ColumnInput,
} from "@/lib/database/sqlite-export-templates";

export type { ColumnType, ExportTemplate, ExportTemplateListItem, ExportTemplateDetail, ExportTemplateSheet, ExportTemplateSheetWithColumns, ExportTemplateColumn, TemplateInput, ColumnInput };

type Row = Record<string, unknown>;
const text = (v: unknown, fallback = "") => v == null ? fallback : String(v);
const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;

function template(r: Row): ExportTemplate { return { id: text(r.id), name: text(r.name), description: text(r.description), status: text(r.status, "Active"), keyField: text(r.key_field, "nik"), createdAt: text(r.created_at), updatedAt: text(r.updated_at) }; }
function sheet(r: Row): ExportTemplateSheet { return { id: text(r.id), templateId: text(r.template_id), name: text(r.name), sheetOrder: number(r.sheet_order), status: text(r.status, "Active"), createdAt: text(r.created_at), updatedAt: text(r.updated_at) }; }
function column(r: Row): ExportTemplateColumn { return { id: text(r.id), sheetId: text(r.sheet_id), columnOrder: number(r.column_order), columnType: text(r.column_type, "FIELD") as ColumnType, sourceField: r.source_field == null ? null : text(r.source_field), displayLabel: text(r.display_label), isKey: Boolean(r.is_key), blankValue: text(r.blank_value), createdAt: text(r.created_at), updatedAt: text(r.updated_at) }; }

async function getSheets(templateId: string): Promise<ExportTemplateSheetWithColumns[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("export_template_sheets").select("*").eq("template_id", templateId).order("sheet_order");
  if (error) throw error;
  return await Promise.all((data as Row[]).map(async (r) => {
    const s = sheet(r);
    const result = await client.from("export_template_columns").select("*").eq("sheet_id", s.id).order("column_order");
    if (result.error) throw result.error;
    return { ...s, columns: (result.data as Row[]).map(column) };
  }));
}

export async function getTemplates(): Promise<ExportTemplateListItem[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("export_templates").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = data as Row[];
    return await Promise.all(rows.map(async (r) => {
      const count = await getSupabaseClient().from("export_template_sheets").select("id", { count: "exact", head: true }).eq("template_id", r.id);
      if (count.error) throw count.error;
      return { ...template(r), sheetCount: count.count ?? 0 };
    }));
  });
}

export async function getTemplateById(id: string): Promise<ExportTemplateDetail | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("export_templates").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? { ...template(data as Row), sheets: await getSheets(id) } : null;
  });
}

export async function createTemplate(input: TemplateInput): Promise<ExportTemplate> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("export_templates").insert({ name: input.name, description: input.description ?? "", key_field: input.keyField ?? "nik" }).select().single();
    if (error) throw error;
    return template(data as Row);
  });
}

export async function updateTemplate(id: string, input: Partial<TemplateInput>): Promise<ExportTemplate> {
  return supabaseGuarded(async () => {
    const patch: Row = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.keyField !== undefined) patch.key_field = input.keyField;
    const { data, error } = await getSupabaseClient().from("export_templates").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Export Template", id);
    return template(data as Row);
  });
}

export async function toggleTemplateStatus(id: string): Promise<ExportTemplate> {
  const current = await getTemplateById(id);
  if (!current) throw new RecordNotFoundError("Export Template", id);
  return updateTemplateStatus(id, current.status.toLowerCase() === "active" ? "Inactive" : "Active");
}
async function updateTemplateStatus(id: string, status: string): Promise<ExportTemplate> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("export_templates").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Export Template", id);
    return template(data as Row);
  });
}

export async function duplicateTemplate(id: string): Promise<ExportTemplateDetail> {
  const source = await getTemplateById(id);
  if (!source) throw new RecordNotFoundError("Export Template", id);
  const copy = await createTemplate({ name: `${source.name} - Copy`, description: source.description, keyField: source.keyField });
  for (const s of source.sheets) {
    const newSheet = await createSheet(copy.id, s.name);
    for (const c of s.columns) await createColumn(newSheet.id, { columnType: c.columnType, sourceField: c.sourceField, displayLabel: c.displayLabel, isKey: c.isKey, blankValue: c.blankValue });
  }
  return (await getTemplateById(copy.id))!;
}

export class DuplicateSheetNameError extends Error { constructor(name: string) { super(`A sheet named "${name}" already exists in this template.`); this.name = "DuplicateSheetNameError"; } }

async function assertSheetName(templateId: string, name: string, exclude?: string) {
  let q = getSupabaseClient().from("export_template_sheets").select("id").eq("template_id", templateId).ilike("name", name);
  if (exclude) q = q.neq("id", exclude);
  const { data, error } = await q.maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  if (data) throw new DuplicateSheetNameError(name);
}

export async function createSheet(templateId: string, name: string): Promise<ExportTemplateSheet> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const exists = await client.from("export_templates").select("id").eq("id", templateId).maybeSingle();
    if (exists.error) throw exists.error;
    if (!exists.data) throw new RecordNotFoundError("Export Template", templateId);
    await assertSheetName(templateId, name);
    const count = await client.from("export_template_sheets").select("id", { count: "exact", head: true }).eq("template_id", templateId);
    if (count.error) throw count.error;
    const result = await client.from("export_template_sheets").insert({ template_id: templateId, name, sheet_order: (count.count ?? 0) + 1 }).select().single();
    if (result.error) throw result.error;
    return sheet(result.data as Row);
  });
}

export async function updateSheetName(id: string, name: string): Promise<ExportTemplateSheet> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const old = await client.from("export_template_sheets").select("*").eq("id", id).maybeSingle();
    if (old.error) throw old.error;
    if (!old.data) throw new RecordNotFoundError("Sheet", id);
    await assertSheetName(text((old.data as Row).template_id), name, id);
    const result = await client.from("export_template_sheets").update({ name, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (result.error) throw result.error;
    return sheet(result.data as Row);
  });
}

export async function deleteSheet(id: string): Promise<void> { return supabaseGuarded(async () => { const r = await getSupabaseClient().from("export_template_sheets").delete().eq("id", id); if (r.error) throw r.error; }); }
export async function reorderSheets(templateId: string, ids: string[]): Promise<void> { return supabaseGuarded(async () => { const r = await getSupabaseClient().from("export_template_sheets").select("id").eq("template_id", templateId); if (r.error) throw r.error; const valid = new Set((r.data as Row[]).map(x => text(x.id))); if (ids.length !== valid.size || ids.some(x => !valid.has(x))) throw new Error("Reorder list does not match this template's sheets."); for (const [i, id] of ids.entries()) { const u = await getSupabaseClient().from("export_template_sheets").update({ sheet_order: i + 1, updated_at: new Date().toISOString() }).eq("id", id); if (u.error) throw u.error; } }); }

export async function createColumn(sheetId: string, input: ColumnInput): Promise<ExportTemplateColumn> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const parent = await client.from("export_template_sheets").select("id").eq("id", sheetId).maybeSingle();
    if (parent.error) throw parent.error;
    if (!parent.data) throw new RecordNotFoundError("Sheet", sheetId);
    const count = await client.from("export_template_columns").select("id", { count: "exact", head: true }).eq("sheet_id", sheetId);
    if (count.error) throw count.error;
    const result = await client.from("export_template_columns").insert({ sheet_id: sheetId, column_order: (count.count ?? 0) + 1, column_type: input.columnType, source_field: input.columnType === "BLANK" || input.columnType === "STATIC" ? null : input.sourceField ?? null, display_label: input.displayLabel ?? "", is_key: input.isKey ?? false, blank_value: input.blankValue ?? "" }).select().single();
    if (result.error) throw result.error;
    return column(result.data as Row);
  });
}

export async function updateColumn(id: string, input: Partial<ColumnInput>): Promise<ExportTemplateColumn> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const old = await client.from("export_template_columns").select("*").eq("id", id).maybeSingle();
    if (old.error) throw old.error;
    if (!old.data) throw new RecordNotFoundError("Column", id);
    const row = old.data as Row; const next = input.columnType ?? text(row.column_type) as ColumnType;
    const patch: Row = { updated_at: new Date().toISOString() };
    if (input.columnType !== undefined) patch.column_type = input.columnType;
    if (input.sourceField !== undefined || input.columnType !== undefined) patch.source_field = next === "BLANK" || next === "STATIC" ? null : input.sourceField ?? row.source_field;
    if (input.displayLabel !== undefined) patch.display_label = input.displayLabel;
    if (input.isKey !== undefined) patch.is_key = input.isKey;
    if (input.blankValue !== undefined) patch.blank_value = input.blankValue;
    const result = await client.from("export_template_columns").update(patch).eq("id", id).select().single();
    if (result.error) throw result.error;
    return column(result.data as Row);
  });
}
export async function deleteColumn(id: string): Promise<void> { return supabaseGuarded(async () => { const r = await getSupabaseClient().from("export_template_columns").delete().eq("id", id); if (r.error) throw r.error; }); }
export async function reorderColumns(sheetId: string, ids: string[]): Promise<void> { return supabaseGuarded(async () => { const r = await getSupabaseClient().from("export_template_columns").select("id").eq("sheet_id", sheetId); if (r.error) throw r.error; const valid = new Set((r.data as Row[]).map(x => text(x.id))); if (ids.length !== valid.size || ids.some(x => !valid.has(x))) throw new Error("Reorder list does not match this sheet's columns."); for (const [i, id] of ids.entries()) { const u = await getSupabaseClient().from("export_template_columns").update({ column_order: i + 1, updated_at: new Date().toISOString() }).eq("id", id); if (u.error) throw u.error; } }); }
