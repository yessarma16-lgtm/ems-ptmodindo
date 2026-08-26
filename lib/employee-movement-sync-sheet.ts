import "server-only";

import { readSheet } from "@/lib/google-sheets";
import { normalizeSheetDate } from "@/lib/employee-sync-sheet";

/**
 * Narrow reader for the "Employee Movement History" sheet tab — lets an
 * admin record Promosi/Demosi/Mutasi from the spreadsheet instead of the
 * dashboard's "Add Movement" box. Columns are matched by fixed position, not
 * by header label lookup (like lib/employee-sync-sheet.ts does), because the
 * header legitimately repeats "DEPARTMENT"/"POSITION" twice (Last vs New) —
 * label matching would be ambiguous.
 *
 * Columns: A NIK, B NAME, C DEPARTMENT (last), D POSITION (last),
 * E DEPARTMENT (new), F POSITION (new), G EFECTIVE DATE, H MOVEMENT TYPE.
 */
export const EMPLOYEE_MOVEMENT_SYNC_SHEET_NAME = "Employee Movement History";

export interface MovementSheetRow {
  /** 1-indexed spreadsheet row, including the header row (row 1) — data starts at row 2. */
  rowNumber: number;
  nik: string;
  name: string;
  lastDepartment: string;
  lastPosition: string;
  newDepartment: string;
  newPosition: string;
  effectiveDate: string;
  movementType: string;
}

export async function readEmployeeMovementSyncSheet(): Promise<MovementSheetRow[]> {
  const grid = await readSheet(EMPLOYEE_MOVEMENT_SYNC_SHEET_NAME, "A:H");
  if (grid.length <= 1) return [];

  const rows: MovementSheetRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const rowNumber = i + 1;
    const raw = grid[i] ?? [];
    const hasAnyValue = raw.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasAnyValue) continue; // trailing/blank rows are common in spreadsheets

    const cell = (index: number) => String(raw[index] ?? "").trim();
    rows.push({
      rowNumber,
      nik: cell(0),
      name: cell(1),
      lastDepartment: cell(2),
      lastPosition: cell(3),
      newDepartment: cell(4),
      newPosition: cell(5),
      effectiveDate: normalizeSheetDate(cell(6)),
      movementType: cell(7),
    });
  }
  return rows;
}
