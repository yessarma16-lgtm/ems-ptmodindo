import "server-only";

import * as store from "@/lib/database/sqlite-export-templates";
import { RecordNotFoundError } from "@/lib/database/errors";

export type {
  ExportTemplate,
  ExportTemplateListItem,
  ExportTemplateDetail,
  ExportTemplateSheet,
  ExportTemplateSheetWithColumns,
  ExportTemplateColumn,
  ColumnType,
  TemplateInput,
  ColumnInput,
} from "@/lib/database/sqlite-export-templates";

export { DuplicateSheetNameError } from "@/lib/database/sqlite-export-templates";

/**
 * Export Template Builder service — the only module API routes should call
 * for template/sheet/column data. Delegates to `lib/database/sqlite-export-templates.ts`.
 *
 *   UI -> API Route -> Export Template Service (this file) -> SQLite
 *
 * STEP 3 scope: configuration only. No Excel is generated here.
 */

export class ExportTemplateNotFoundError extends RecordNotFoundError {
  constructor(id: string) {
    super("Export Template", id);
    this.name = "ExportTemplateNotFoundError";
  }
}

export function getTemplates() {
  return store.getTemplates();
}

export function getTemplateById(id: string) {
  return store.getTemplateById(id);
}

export function createTemplate(input: store.TemplateInput) {
  return store.createTemplate(input);
}

export function updateTemplate(id: string, input: Partial<store.TemplateInput>) {
  return store.updateTemplate(id, input);
}

export function toggleTemplateStatus(id: string) {
  return store.toggleTemplateStatus(id);
}

export function duplicateTemplate(id: string) {
  return store.duplicateTemplate(id);
}

export function createTemplateSheet(templateId: string, name: string) {
  return store.createSheet(templateId, name);
}

export function updateTemplateSheet(sheetId: string, name: string) {
  return store.updateSheetName(sheetId, name);
}

export function deleteTemplateSheet(sheetId: string) {
  return store.deleteSheet(sheetId);
}

export function reorderTemplateSheets(templateId: string, orderedSheetIds: string[]) {
  return store.reorderSheets(templateId, orderedSheetIds);
}

export function createTemplateColumn(sheetId: string, input: store.ColumnInput) {
  return store.createColumn(sheetId, input);
}

export function updateTemplateColumn(columnId: string, input: Partial<store.ColumnInput>) {
  return store.updateColumn(columnId, input);
}

export function deleteTemplateColumn(columnId: string) {
  return store.deleteColumn(columnId);
}

export function reorderTemplateColumns(sheetId: string, orderedColumnIds: string[]) {
  return store.reorderColumns(sheetId, orderedColumnIds);
}
