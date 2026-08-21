import "server-only";

import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { RecordNotFoundError } from "@/lib/database/errors";

/**
 * Export Template Builder storage (STEP 3). SQLite-only for now — this is
 * a brand new feature with no existing Google Sheets equivalent, so unlike
 * Employees/Master Data there is no `DatabaseAdapter` split yet. It never
 * stores employee data, only admin-defined sheet/column configuration.
 * Kept as its own thin module (not inlined into API routes) so a future
 * production-provider swap only touches this one file.
 */

type SqlRow = Record<string, unknown>;

export type ColumnType = "FIELD" | "BLANK" | "STATIC";

export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  status: string;
  keyField: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportTemplateListItem extends ExportTemplate {
  sheetCount: number;
}

export interface ExportTemplateSheet {
  id: string;
  templateId: string;
  name: string;
  sheetOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportTemplateColumn {
  id: string;
  sheetId: string;
  columnOrder: number;
  columnType: ColumnType;
  sourceField: string | null;
  displayLabel: string;
  isKey: boolean;
  blankValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportTemplateSheetWithColumns extends ExportTemplateSheet {
  columns: ExportTemplateColumn[];
}

export interface ExportTemplateDetail extends ExportTemplate {
  sheets: ExportTemplateSheetWithColumns[];
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToTemplate(row: SqlRow): ExportTemplate {
  return {
    id: String(row.id),
    name: str(row.name),
    description: str(row.description),
    status: str(row.status) || "Active",
    keyField: str(row.key_field) || "nik",
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function rowToSheet(row: SqlRow): ExportTemplateSheet {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    name: str(row.name),
    sheetOrder: num(row.sheet_order),
    status: str(row.status) || "Active",
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function rowToColumn(row: SqlRow): ExportTemplateColumn {
  return {
    id: String(row.id),
    sheetId: String(row.sheet_id),
    columnOrder: num(row.column_order),
    columnType: (str(row.column_type) as ColumnType) || "FIELD",
    sourceField: row.source_field === null || row.source_field === undefined ? null : String(row.source_field),
    displayLabel: str(row.display_label),
    isKey: num(row.is_key) === 1,
    blankValue: str(row.blank_value),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

export function getTemplates(): ExportTemplateListItem[] {
  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM export_template_sheets s WHERE s.template_id = t.id) as sheet_count
       FROM export_templates t
       ORDER BY t.updated_at DESC`,
    )
    .all() as SqlRow[];
  return rows.map((row) => ({ ...rowToTemplate(row), sheetCount: num(row.sheet_count) }));
}

export function getTemplateById(id: string): ExportTemplateDetail | null {
  const db = getSqliteDb();
  const templateRow = db.prepare("SELECT * FROM export_templates WHERE id = ?").get(id) as
    | SqlRow
    | undefined;
  if (!templateRow) return null;

  const sheetRows = db
    .prepare("SELECT * FROM export_template_sheets WHERE template_id = ? ORDER BY sheet_order ASC")
    .all(id) as SqlRow[];

  const sheets: ExportTemplateSheetWithColumns[] = sheetRows.map((sheetRow) => {
    const columnRows = db
      .prepare("SELECT * FROM export_template_columns WHERE sheet_id = ? ORDER BY column_order ASC")
      .all(sheetRow.id as string | number) as SqlRow[];
    return { ...rowToSheet(sheetRow), columns: columnRows.map(rowToColumn) };
  });

  return { ...rowToTemplate(templateRow), sheets };
}

export interface TemplateInput {
  name: string;
  description?: string;
  keyField?: string;
}

export function createTemplate(input: TemplateInput): ExportTemplate {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      "INSERT INTO export_templates (name, description, status, key_field, created_at, updated_at) VALUES (?, ?, 'Active', ?, ?, ?)",
    )
    .run(input.name, input.description ?? "", input.keyField ?? "nik", now, now);
  const row = db.prepare("SELECT * FROM export_templates WHERE id = ?").get(info.lastInsertRowid) as SqlRow;
  return rowToTemplate(row);
}

export function updateTemplate(id: string, input: Partial<TemplateInput>): ExportTemplate {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM export_templates WHERE id = ?").get(id);
  if (!existing) throw new RecordNotFoundError("Export Template", id);

  const setClauses: string[] = [];
  const values: string[] = [];
  if (input.name !== undefined) { setClauses.push("name = ?"); values.push(input.name); }
  if (input.description !== undefined) { setClauses.push("description = ?"); values.push(input.description); }
  if (input.keyField !== undefined) { setClauses.push("key_field = ?"); values.push(input.keyField); }
  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());

  db.prepare(`UPDATE export_templates SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, id);
  const row = db.prepare("SELECT * FROM export_templates WHERE id = ?").get(id) as SqlRow;
  return rowToTemplate(row);
}

export function toggleTemplateStatus(id: string): ExportTemplate {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM export_templates WHERE id = ?").get(id) as SqlRow | undefined;
  if (!row) throw new RecordNotFoundError("Export Template", id);
  const nextStatus = str(row.status).toLowerCase() === "active" ? "Inactive" : "Active";
  return updateTemplateStatus(id, nextStatus);
}

function updateTemplateStatus(id: string, status: string): ExportTemplate {
  const db = getSqliteDb();
  db.prepare("UPDATE export_templates SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    id,
  );
  const row = db.prepare("SELECT * FROM export_templates WHERE id = ?").get(id) as SqlRow;
  return rowToTemplate(row);
}

/** Deep-copies a template: new IDs for the template, every sheet, and every column. */
export function duplicateTemplate(id: string): ExportTemplateDetail {
  const source = getTemplateById(id);
  if (!source) throw new RecordNotFoundError("Export Template", id);

  const db = getSqliteDb();
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    const templateInfo = db
      .prepare(
        "INSERT INTO export_templates (name, description, status, key_field, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(`${source.name} - Copy`, source.description, source.status, source.keyField, now, now);
    const newTemplateId = templateInfo.lastInsertRowid;

    for (const sheet of source.sheets) {
      const sheetInfo = db
        .prepare(
          "INSERT INTO export_template_sheets (template_id, name, sheet_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(newTemplateId, sheet.name, sheet.sheetOrder, sheet.status, now, now);
      const newSheetId = sheetInfo.lastInsertRowid;

      for (const col of sheet.columns) {
        db.prepare(
          `INSERT INTO export_template_columns
             (sheet_id, column_order, column_type, source_field, display_label, is_key, blank_value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newSheetId,
          col.columnOrder,
          col.columnType,
          col.sourceField,
          col.displayLabel,
          col.isKey ? 1 : 0,
          col.blankValue,
          now,
          now,
        );
      }
    }

    db.exec("COMMIT");
    return getTemplateById(String(newTemplateId))!;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                       */
/* -------------------------------------------------------------------------- */

export class DuplicateSheetNameError extends Error {
  constructor(name: string) {
    super(`A sheet named "${name}" already exists in this template.`);
    this.name = "DuplicateSheetNameError";
  }
}

function assertUniqueSheetName(templateId: string, name: string, excludeSheetId?: string): void {
  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT id FROM export_template_sheets
       WHERE template_id = ? AND LOWER(name) = LOWER(?) ${excludeSheetId ? "AND id != ?" : ""}`,
    )
    .get(...(excludeSheetId ? [templateId, name, excludeSheetId] : [templateId, name]));
  if (row) throw new DuplicateSheetNameError(name);
}

export function createSheet(templateId: string, name: string): ExportTemplateSheet {
  const db = getSqliteDb();
  const template = db.prepare("SELECT id FROM export_templates WHERE id = ?").get(templateId);
  if (!template) throw new RecordNotFoundError("Export Template", templateId);
  assertUniqueSheetName(templateId, name);

  const now = new Date().toISOString();
  const countRow = db
    .prepare("SELECT COUNT(*) as c FROM export_template_sheets WHERE template_id = ?")
    .get(templateId) as { c: number };

  const info = db
    .prepare(
      "INSERT INTO export_template_sheets (template_id, name, sheet_order, status, created_at, updated_at) VALUES (?, ?, ?, 'Active', ?, ?)",
    )
    .run(templateId, name, countRow.c + 1, now, now);

  const row = db.prepare("SELECT * FROM export_template_sheets WHERE id = ?").get(info.lastInsertRowid) as SqlRow;
  return rowToSheet(row);
}

export function updateSheetName(sheetId: string, name: string): ExportTemplateSheet {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT * FROM export_template_sheets WHERE id = ?").get(sheetId) as
    | SqlRow
    | undefined;
  if (!existing) throw new RecordNotFoundError("Sheet", sheetId);
  assertUniqueSheetName(String(existing.template_id), name, sheetId);

  db.prepare("UPDATE export_template_sheets SET name = ?, updated_at = ? WHERE id = ?").run(
    name,
    new Date().toISOString(),
    sheetId,
  );
  const row = db.prepare("SELECT * FROM export_template_sheets WHERE id = ?").get(sheetId) as SqlRow;
  return rowToSheet(row);
}

/** Removes the sheet and (via ON DELETE CASCADE) every column inside it. Never touches the template or other sheets. */
export function deleteSheet(sheetId: string): void {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM export_template_sheets WHERE id = ?").get(sheetId);
  if (!existing) throw new RecordNotFoundError("Sheet", sheetId);
  db.prepare("DELETE FROM export_template_sheets WHERE id = ?").run(sheetId);
}

export function reorderSheets(templateId: string, orderedSheetIds: string[]): void {
  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT id FROM export_template_sheets WHERE template_id = ?")
    .all(templateId) as SqlRow[];
  const validIds = new Set(rows.map((r) => String(r.id)));
  if (orderedSheetIds.length !== validIds.size || orderedSheetIds.some((id) => !validIds.has(id))) {
    throw new Error("Reorder list does not match this template's sheets.");
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    orderedSheetIds.forEach((sheetId, idx) => {
      db.prepare("UPDATE export_template_sheets SET sheet_order = ?, updated_at = ? WHERE id = ?").run(
        idx + 1,
        now,
        sheetId,
      );
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Columns                                                                      */
/* -------------------------------------------------------------------------- */

export interface ColumnInput {
  columnType: ColumnType;
  sourceField?: string | null;
  displayLabel?: string;
  isKey?: boolean;
  blankValue?: string;
}

export function createColumn(sheetId: string, input: ColumnInput): ExportTemplateColumn {
  const db = getSqliteDb();
  const sheet = db.prepare("SELECT id FROM export_template_sheets WHERE id = ?").get(sheetId);
  if (!sheet) throw new RecordNotFoundError("Sheet", sheetId);

  const now = new Date().toISOString();
  const countRow = db
    .prepare("SELECT COUNT(*) as c FROM export_template_columns WHERE sheet_id = ?")
    .get(sheetId) as { c: number };

  const info = db
    .prepare(
      `INSERT INTO export_template_columns
         (sheet_id, column_order, column_type, source_field, display_label, is_key, blank_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sheetId,
      countRow.c + 1,
      input.columnType,
      input.columnType === "BLANK" || input.columnType === "STATIC" ? null : input.sourceField ?? null,
      input.displayLabel ?? "",
      input.isKey ? 1 : 0,
      input.blankValue ?? "",
      now,
      now,
    );

  const row = db.prepare("SELECT * FROM export_template_columns WHERE id = ?").get(info.lastInsertRowid) as SqlRow;
  return rowToColumn(row);
}

export function updateColumn(columnId: string, input: Partial<ColumnInput>): ExportTemplateColumn {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT * FROM export_template_columns WHERE id = ?").get(columnId) as
    | SqlRow
    | undefined;
  if (!existing) throw new RecordNotFoundError("Column", columnId);

  const nextType = input.columnType ?? (str(existing.column_type) as ColumnType);
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.columnType !== undefined) { setClauses.push("column_type = ?"); values.push(input.columnType); }
  if (input.sourceField !== undefined || input.columnType !== undefined) {
    setClauses.push("source_field = ?");
    values.push(
      nextType === "BLANK" || nextType === "STATIC"
        ? null
        : input.sourceField ?? (existing.source_field as string | null),
    );
  }
  if (input.displayLabel !== undefined) { setClauses.push("display_label = ?"); values.push(input.displayLabel); }
  if (input.isKey !== undefined) { setClauses.push("is_key = ?"); values.push(input.isKey ? 1 : 0); }
  if (input.blankValue !== undefined) { setClauses.push("blank_value = ?"); values.push(input.blankValue); }
  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());

  db.prepare(`UPDATE export_template_columns SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, columnId);
  const row = db.prepare("SELECT * FROM export_template_columns WHERE id = ?").get(columnId) as SqlRow;
  return rowToColumn(row);
}

export function deleteColumn(columnId: string): void {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM export_template_columns WHERE id = ?").get(columnId);
  if (!existing) throw new RecordNotFoundError("Column", columnId);
  db.prepare("DELETE FROM export_template_columns WHERE id = ?").run(columnId);
}

export function reorderColumns(sheetId: string, orderedColumnIds: string[]): void {
  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT id FROM export_template_columns WHERE sheet_id = ?")
    .all(sheetId) as SqlRow[];
  const validIds = new Set(rows.map((r) => String(r.id)));
  if (orderedColumnIds.length !== validIds.size || orderedColumnIds.some((id) => !validIds.has(id))) {
    throw new Error("Reorder list does not match this sheet's columns.");
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    orderedColumnIds.forEach((columnId, idx) => {
      db.prepare("UPDATE export_template_columns SET column_order = ?, updated_at = ? WHERE id = ?").run(
        idx + 1,
        now,
        columnId,
      );
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
