import "server-only";

import { readSheet } from "@/lib/google-sheets";
import { EMPLOYEE_SYNC_FIELDS, type EmployeeSyncFieldKey } from "@/config/employee-sync-fields";

/**
 * Narrow reader for the dedicated "Employee Sync" tab — separate from the
 * legacy `lib/database/google-sheets-adapter.ts` (that implements the old
 * full-database `DatabaseAdapter` interface and is no longer wired into the
 * app). Only reads via `lib/google-sheets.ts`, the sole module allowed to
 * talk to the Sheets API directly.
 */
export const EMPLOYEE_SYNC_SHEET_NAME = "Employee Sync";

export interface SheetEmployeeRow {
  /** 1-indexed spreadsheet row, including the header row (row 1) — data starts at row 2. */
  rowNumber: number;
  values: Record<EmployeeSyncFieldKey, string>;
}

export interface SheetRejectedRow {
  rowNumber: number;
  reason: string;
}

/**
 * Reads the "Employee Sync" tab. The header row (row 1) is matched to field
 * keys by label text, case-insensitively — the same lookup pattern
 * `lib/employee-import.ts` already uses for Excel imports — so column order
 * in the sheet doesn't matter and reordering columns never silently breaks
 * the mapping.
 */
export async function readEmployeeSyncSheet(): Promise<{ rows: SheetEmployeeRow[]; rejected: SheetRejectedRow[] }> {
  const grid = await readSheet(EMPLOYEE_SYNC_SHEET_NAME, "A:Z");
  if (grid.length === 0) return { rows: [], rejected: [] };

  const header = grid[0] ?? [];
  const columnKeyByIndex = new Map<number, EmployeeSyncFieldKey>();
  header.forEach((label, index) => {
    const normalized = String(label ?? "").trim().toLowerCase();
    const field = EMPLOYEE_SYNC_FIELDS.find((f) => f.label.toLowerCase() === normalized);
    if (field) columnKeyByIndex.set(index, field.key as EmployeeSyncFieldKey);
  });

  const rows: SheetEmployeeRow[] = [];
  const rejected: SheetRejectedRow[] = [];

  for (let i = 1; i < grid.length; i++) {
    const rowNumber = i + 1;
    const rawRow = grid[i] ?? [];
    const hasAnyValue = rawRow.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasAnyValue) continue; // trailing/blank rows are common in spreadsheets

    const values = {} as Record<EmployeeSyncFieldKey, string>;
    for (const field of EMPLOYEE_SYNC_FIELDS) values[field.key as EmployeeSyncFieldKey] = "";
    columnKeyByIndex.forEach((key, index) => {
      values[key] = String(rawRow[index] ?? "").trim();
    });

    if (!values.nik) {
      rejected.push({ rowNumber, reason: "NIK (EMPLOYEE ID) is blank — can't match or create a row without it." });
      continue;
    }

    rows.push({ rowNumber, values });
  }

  return { rows, rejected };
}
