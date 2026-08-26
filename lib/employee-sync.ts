import "server-only";

import { EMPLOYEE_SYNC_FIELD_KEYS, EMPLOYEE_SYNC_FIELDS, type EmployeeSyncFieldKey } from "@/config/employee-sync-fields";
import { readEmployeeSyncSheet } from "@/lib/employee-sync-sheet";
import { employeeSyncRowSchema } from "@/schemas/employee-sync.schema";
import { buildMasterDataCasingMap, normalizeToMasterDataCasing } from "@/lib/employee-import";
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee } from "@/lib/employee-service";
import { getContractCriteria } from "@/lib/contract-criteria-service";
import { calculateContractPeriodDates } from "@/lib/contract-dates";
import type { EmployeeInput, EmployeeRecord, ContractCriteriaItem } from "@/lib/database/types";

/**
 * Diff/sync engine for the "Employee Sync" Google Sheet tab (Phase 1: NIK is
 * the matching key — see docs on Phase 2 below for what's deliberately not
 * built yet). Mirrors the shape of `lib/attendance-import.ts`'s
 * preview-then-commit pattern.
 */

export interface SyncFieldDiff {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export interface SyncNewRow {
  rowNumber: number;
  nik: string;
  incoming: EmployeeInput;
}

export interface SyncChangedRow {
  rowNumber: number;
  nik: string;
  recordId: string;
  incoming: EmployeeInput;
  diffs: SyncFieldDiff[];
}

/** Same shape as SyncChangedRow — a separate name only to distinguish the two preview groups. */
export type SyncInactivatedRow = SyncChangedRow;

export interface SyncRejectedRow {
  rowNumber: number;
  reason: string;
}

export interface EmployeeSyncPreview {
  newRows: SyncNewRow[];
  changedRows: SyncChangedRow[];
  inactivatedRows: SyncInactivatedRow[];
  rejected: SyncRejectedRow[];
  /** Rows matched by NIK with no differing field — not returned individually, just counted. */
  unchangedCount: number;
  /** Non-fatal data-quality notices (e.g. duplicate NIK already in the dashboard) shown as a banner, not blocking. */
  warnings: string[];
}

function norm(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/** Fields never diffed against the dashboard for an EXISTING employee: NIK is the match key itself, FINGER CODE is generated once at creation and immutable afterward (updateEmployee silently ignores it), STATUS gets its own blank-means-"don't touch" handling below. */
const DIFF_EXCLUDED_FOR_EXISTING = new Set<EmployeeSyncFieldKey>(["nik", "fingerCode", "status"]);

const CONTRACT_CLOSE_KEYS = [
  "contractCloseFirst",
  "contractCloseSecond",
  "contractCloseThird",
  "contractCloseFourth",
  "contractCloseFiveth",
] as const;

/**
 * Mirrors EmployeeForm.tsx's syncAutoContractPeriods for the sync path (the
 * form's version only runs client-side on user keystrokes — a row committed
 * straight from the sheet never goes through it). Fills CONTRACT
 * CLOSE-FIRST/SECOND/... from JOIN DATE + CONTRACT CRITERIA's periods
 * (lib/contract-dates.ts), but only into slots that are genuinely empty —
 * a value already on the sheet row (admin typed one explicitly) or already
 * on the existing employee record (manual dashboard edit, or a prior
 * calc/sync) is left untouched, never silently overwritten.
 */
function applyContractCriteriaCalc(
  incoming: EmployeeInput,
  existing: EmployeeRecord | undefined,
  criteriaList: ContractCriteriaItem[],
): void {
  const criteria = criteriaList.find((c) => c.name === norm(incoming.contractCriteria) && c.periods.length > 0);
  if (!criteria || !norm(incoming.joinDate)) return;

  const computed = calculateContractPeriodDates(incoming.joinDate, criteria.periods);
  computed.forEach((period, idx) => {
    const key = CONTRACT_CLOSE_KEYS[idx];
    if (!key) return;
    if (norm(incoming[key])) return; // sheet explicitly set this slot
    if (existing && norm(existing[key])) return; // already set on the dashboard record
    incoming[key] = period.endDate;
  });
}

export async function previewEmployeeSync(): Promise<EmployeeSyncPreview> {
  const { rows: sheetRows, rejected: sheetRejected } = await readEmployeeSyncSheet();
  const rejected: SyncRejectedRow[] = [...sheetRejected];

  const employees = await getEmployees();
  const criteriaList = await getContractCriteria({ activeOnly: true });
  const nikMap = new Map<string, EmployeeRecord>();
  const warnings: string[] = [];
  for (const emp of employees) {
    const nik = norm(emp.nik);
    if (!nik) continue;
    if (nikMap.has(nik)) {
      warnings.push(`Duplicate NIK "${nik}" found among existing employees — sync matched the first record found. Consider fixing this in the dashboard.`);
      continue;
    }
    nikMap.set(nik, emp);
  }

  const casingByField = await buildMasterDataCasingMap();
  const seenSheetNiks = new Set<string>();

  const newRows: SyncNewRow[] = [];
  const changedRows: SyncChangedRow[] = [];
  const inactivatedRows: SyncInactivatedRow[] = [];
  let unchangedCount = 0;

  for (const row of sheetRows) {
    const nik = norm(row.values.nik);
    if (seenSheetNiks.has(nik)) {
      rejected.push({ rowNumber: row.rowNumber, reason: `Duplicate NIK "${nik}" in the sheet — a previous row already used this NIK.` });
      continue;
    }
    seenSheetNiks.add(nik);

    const parsed = employeeSyncRowSchema.safeParse(row.values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rejected.push({ rowNumber: row.rowNumber, reason: issue?.message ?? "Invalid row." });
      continue;
    }

    const incoming: EmployeeInput = { ...parsed.data };
    normalizeToMasterDataCasing(incoming, casingByField);

    const existing = nikMap.get(nik);

    if (!existing) {
      // Brand-new employee: a blank STATUS cell defaults to Active (there's no
      // prior status to accidentally clear here, unlike the existing-row case below).
      if (!norm(incoming.status)) incoming.status = "Active";
      applyContractCriteriaCalc(incoming, undefined, criteriaList);
      newRows.push({ rowNumber: row.rowNumber, nik, incoming });
      continue;
    }

    // A blank STATUS cell on an existing row means "admin isn't managing
    // status from the sheet for this row" — treat as no-op rather than a
    // diff that would clear it, and never send it to updateEmployee.
    const sheetStatusRaw = norm(incoming.status);
    if (!sheetStatusRaw) delete incoming.status;

    applyContractCriteriaCalc(incoming, existing, criteriaList);

    const diffs: SyncFieldDiff[] = [];
    for (const key of EMPLOYEE_SYNC_FIELD_KEYS) {
      if (DIFF_EXCLUDED_FOR_EXISTING.has(key)) continue;
      const oldValue = norm(existing[key]);
      const newValue = norm(incoming[key]);
      if (oldValue !== newValue) {
        const fieldMeta = EMPLOYEE_SYNC_FIELDS.find((f) => f.key === key);
        diffs.push({ field: key, label: fieldMeta?.label ?? key, oldValue, newValue });
      }
    }

    const movingToInactive = sheetStatusRaw.toLowerCase() === "inactive" && norm(existing.status).toLowerCase() !== "inactive";
    if (movingToInactive) {
      diffs.push({ field: "status", label: "STATUS", oldValue: norm(existing.status), newValue: incoming.status });
    }

    if (diffs.length === 0) {
      unchangedCount += 1;
      continue;
    }

    const entry: SyncChangedRow = { rowNumber: row.rowNumber, nik, recordId: existing.recordId, incoming, diffs };
    // Phase 2 note: matching is NIK-only for now — a future pre-NIK matching
    // key (hidden locked ID column) would extend the lookup above, not this
    // classification step.
    if (movingToInactive) inactivatedRows.push(entry);
    else changedRows.push(entry);
  }

  return { newRows, changedRows, inactivatedRows, rejected, unchangedCount, warnings };
}

export interface EmployeeSyncCommitSummary {
  createdCount: number;
  updatedCount: number;
  movedToInactiveCount: number;
  skippedCount: number;
  errors: { rowNumber: number; nik: string; message: string }[];
}

export interface CommitRowGroups {
  newRows: { rowNumber: number; nik: string; incoming: EmployeeInput }[];
  changedRows: { rowNumber: number; nik: string; recordId: string; incoming: EmployeeInput }[];
  inactivatedRows: { rowNumber: number; nik: string; recordId: string; incoming: EmployeeInput }[];
}

/** Decisions keyed by NIK — the stable identity used everywhere in this feature, unaffected by row-number drift between preview and commit calls. */
export async function commitEmployeeSync(
  rows: CommitRowGroups,
  decisions: Record<string, "apply" | "skip">,
  onProgress?: (processed: number, total: number) => void,
): Promise<EmployeeSyncCommitSummary> {
  const total = rows.newRows.length + rows.changedRows.length + rows.inactivatedRows.length;
  let processed = 0;
  const summary: EmployeeSyncCommitSummary = { createdCount: 0, updatedCount: 0, movedToInactiveCount: 0, skippedCount: 0, errors: [] };

  function tick() {
    processed += 1;
    onProgress?.(processed, total);
  }

  for (const row of rows.newRows) {
    if (decisions[row.nik] === "skip") {
      summary.skippedCount += 1;
      tick();
      continue;
    }
    try {
      await createEmployee(row.incoming);
      summary.createdCount += 1;
    } catch (err) {
      summary.errors.push({ rowNumber: row.rowNumber, nik: row.nik, message: err instanceof Error ? err.message : "Failed to create employee." });
    }
    tick();
  }

  for (const row of rows.changedRows) {
    if (decisions[row.nik] === "skip") {
      summary.skippedCount += 1;
      tick();
      continue;
    }
    try {
      await updateEmployee(row.recordId, row.incoming);
      summary.updatedCount += 1;
    } catch (err) {
      summary.errors.push({ rowNumber: row.rowNumber, nik: row.nik, message: err instanceof Error ? err.message : "Failed to update employee." });
    }
    tick();
  }

  for (const row of rows.inactivatedRows) {
    if (decisions[row.nik] === "skip") {
      summary.skippedCount += 1;
      tick();
      continue;
    }
    try {
      // deactivateEmployee is the single source of the soft-delete policy
      // (status: Inactive, exitDate: existing || today); a follow-up
      // updateEmployee applies the rest of the sheet's incoming fields
      // (e.g. an explicit EXIT DATE or REASON) without duplicating that policy.
      await deactivateEmployee(row.recordId);
      await updateEmployee(row.recordId, { ...row.incoming, status: "Inactive" });
      summary.movedToInactiveCount += 1;
    } catch (err) {
      summary.errors.push({ rowNumber: row.rowNumber, nik: row.nik, message: err instanceof Error ? err.message : "Failed to move employee to Inactive." });
    }
    tick();
  }

  return summary;
}
