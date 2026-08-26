import "server-only";

import { readSheet } from "@/lib/google-sheets";
import { EMPLOYEES_LAST_COLUMN } from "@/config/employee-fields";
import {
  EMPLOYEE_SYNC_FIELDS,
  EMPLOYEE_SYNC_UNMAPPED_COLUMN_KEYS,
  type EmployeeSyncFieldKey,
} from "@/config/employee-sync-fields";

/**
 * Narrow reader for the dedicated sync tab — separate from the legacy
 * `lib/database/google-sheets-adapter.ts` (that implements the old
 * full-database `DatabaseAdapter` interface and is no longer wired into the
 * app). Only reads via `lib/google-sheets.ts`, the sole module allowed to
 * talk to the Sheets API directly.
 *
 * Tab name is "Employee Database ModIndo", not "Employee Sync" — the
 * spreadsheet was reorganized down to this one tab (every other legacy tab
 * was deleted; their data already lives in Postgres and the app never reads
 * them). If this tab ever gets renamed again, sync breaks with "Unable to
 * connect to Employee Database" until this constant is updated to match.
 */
export const EMPLOYEE_SYNC_SHEET_NAME = "Employee Database ModIndo";

export interface SheetEmployeeRow {
  /** 1-indexed spreadsheet row, including the header row (row 1) — data starts at row 2. */
  rowNumber: number;
  values: Record<EmployeeSyncFieldKey, string>;
}

export interface SheetRejectedRow {
  rowNumber: number;
  /** Best-effort — blank if the NAME cell itself was also empty. Lets the UI show who a rejection belongs to instead of just a row number. */
  name: string;
  reason: string;
}

const DATE_FIELD_KEYS = new Set(EMPLOYEE_SYNC_FIELDS.filter((f) => f.type === "date").map((f) => f.key));

/**
 * The Sheets API returns each cell as its FORMATTED display string, not a
 * typed date — so a JOIN DATE cell shown as "18-08-2026" arrives as that
 * literal text, in whatever day/month order the sheet's locale displays
 * (Indonesian sheets: DD-MM-YYYY or DD/MM/YYYY). The rest of the app expects
 * ISO "YYYY-MM-DD" (native `<input type="date">` silently blanks anything
 * else). Recognized shapes are converted; anything else is left as-is rather
 * than silently discarded, so an unrecognized format still fails validation
 * visibly instead of vanishing.
 */
export function normalizeSheetDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

/**
 * Reads the "Employee Sync" tab. The header row (row 1) is matched to field
 * keys by label text, case-insensitively — the same lookup pattern
 * `lib/employee-import.ts` already uses for Excel imports — so column order
 * in the sheet doesn't matter and reordering columns never silently breaks
 * the mapping.
 */
export async function readEmployeeSyncSheet(): Promise<{ rows: SheetEmployeeRow[]; rejected: SheetRejectedRow[] }> {
  const grid = await readSheet(EMPLOYEE_SYNC_SHEET_NAME, `A:${EMPLOYEES_LAST_COLUMN}`);
  if (grid.length === 0) return { rows: [], rejected: [] };

  const header = grid[0] ?? [];
  const columnKeyByIndex = new Map<number, EmployeeSyncFieldKey>();
  header.forEach((label, index) => {
    const normalized = String(label ?? "").trim().toLowerCase();
    const field = EMPLOYEE_SYNC_FIELDS.find((f) => f.label.toLowerCase() === normalized);
    if (field && !EMPLOYEE_SYNC_UNMAPPED_COLUMN_KEYS.has(field.key)) {
      columnKeyByIndex.set(index, field.key as EmployeeSyncFieldKey);
    }
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
      const raw = String(rawRow[index] ?? "").trim();
      values[key] = DATE_FIELD_KEYS.has(key) ? normalizeSheetDate(raw) : raw;
    });

    if (!values.nik) {
      rejected.push({
        rowNumber,
        name: values.name ?? "",
        reason: "NIK (EMPLOYEE ID) is blank — can't match or create a row without it.",
      });
      continue;
    }

    rows.push({ rowNumber, values });
  }

  return { rows, rejected };
}
