import "server-only";

import { getDatabaseProvider } from "@/lib/database/database";
import * as store from "@/lib/database/sqlite-export-templates";
import * as postgresStore from "@/lib/database/postgres-export-templates";
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
 *   UI -> API Route -> Export Template Service -> active database adapter
 *
 * STEP 3 scope: configuration only. No Excel is generated here.
 */

export class ExportTemplateNotFoundError extends RecordNotFoundError {
  constructor(id: string) {
    super("Export Template", id);
    this.name = "ExportTemplateNotFoundError";
  }
}

function activeStore() {
  return getDatabaseProvider() === "postgres" ? postgresStore : store;
}

export function getTemplates() {
  return activeStore().getTemplates();
}

export function getTemplateById(id: string) {
  return activeStore().getTemplateById(id);
}

export function createTemplate(input: store.TemplateInput) {
  return activeStore().createTemplate(input);
}

export function updateTemplate(id: string, input: Partial<store.TemplateInput>) {
  return activeStore().updateTemplate(id, input);
}

export function toggleTemplateStatus(id: string) {
  return activeStore().toggleTemplateStatus(id);
}

export function duplicateTemplate(id: string) {
  return activeStore().duplicateTemplate(id);
}

export function createTemplateSheet(templateId: string, name: string) {
  return activeStore().createSheet(templateId, name);
}

export function updateTemplateSheet(sheetId: string, name: string) {
  return activeStore().updateSheetName(sheetId, name);
}

export function deleteTemplateSheet(sheetId: string) {
  return activeStore().deleteSheet(sheetId);
}

export function reorderTemplateSheets(templateId: string, orderedSheetIds: string[]) {
  return activeStore().reorderSheets(templateId, orderedSheetIds);
}

export function createTemplateColumn(sheetId: string, input: store.ColumnInput) {
  return activeStore().createColumn(sheetId, input);
}

export function updateTemplateColumn(columnId: string, input: Partial<store.ColumnInput>) {
  return activeStore().updateColumn(columnId, input);
}

export function deleteTemplateColumn(columnId: string) {
  return activeStore().deleteColumn(columnId);
}

export function reorderTemplateColumns(sheetId: string, orderedColumnIds: string[]) {
  return activeStore().reorderColumns(sheetId, orderedColumnIds);
}
