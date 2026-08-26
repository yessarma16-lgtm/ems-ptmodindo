import "server-only";

import { EMPLOYEE_SYNC_FIELD_KEYS, EMPLOYEE_SYNC_FIELDS, type EmployeeSyncFieldKey } from "@/config/employee-sync-fields";
import { FIELD_MASTER_DATA_SOURCE } from "@/config/field-master-data-map";
import { readEmployeeSyncSheet, normalizeSheetDate } from "@/lib/employee-sync-sheet";
import { readEmployeeMovementSyncSheet } from "@/lib/employee-movement-sync-sheet";
import { employeeSyncRowSchema } from "@/schemas/employee-sync.schema";
import { buildMasterDataCasingMap, normalizeToMasterDataCasing } from "@/lib/employee-import";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  getContractHistory,
  createContractHistoryEntry,
} from "@/lib/employee-service";
import { getContractCriteria } from "@/lib/contract-criteria-service";
import { autoLogPermanentMovement, getMovementHistory, createMovementEntry } from "@/lib/employee-movement-service";
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
  /** Best-effort — blank if the NAME cell itself was also empty/unreadable. */
  name: string;
  reason: string;
}

/** One row matched by NIK with no differing field — listed (not just counted) so the admin can see who's already in sync. */
export interface SyncUnchangedRow {
  nik: string;
  name: string;
}

export interface EmployeeSyncPreview {
  newRows: SyncNewRow[];
  changedRows: SyncChangedRow[];
  inactivatedRows: SyncInactivatedRow[];
  rejected: SyncRejectedRow[];
  unchangedRows: SyncUnchangedRow[];
  /** Non-fatal data-quality notices (e.g. duplicate NIK already in the dashboard) shown as a banner, not blocking. */
  warnings: string[];
}

function norm(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/**
 * BPJS KTK / BPJS KES are declared as "select" fields (config/employee-fields.ts,
 * FIELD_MASTER_DATA_SOURCE) but real production data has always held a date
 * (the BPJS enrollment date, e.g. "2022-04-05") — no Master Data list
 * meaningfully describes them. Validated as dates here instead of matched
 * against Master Data, and normalized to ISO like a real date field.
 */
const DATE_ONLY_SYNC_FIELDS = new Set(["bpjsKtk", "bpjsKes"]);

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

/**
 * CONTRACT STATUS is the one "lookup"-backed field kept strict despite the
 * general lookup-fields-are-loose rule below — its exact value drives real
 * downstream logic (PERMANEN DATE requirement, Contract Criteria period
 * calculation via .toLowerCase() === "probation"/"permanent" comparisons in
 * this file), so a typo silently passing through would quietly break those,
 * not just leave a cosmetic mismatch.
 */
const STRICT_LOOKUP_SYNC_FIELDS = new Set(["contractStatus"]);

/**
 * Only select-type sync fields backed by a "sheet" Master Data source
 * (Department, Position, Level, Skill, Bank Name) — plus CONTRACT STATUS,
 * see STRICT_LOOKUP_SYNC_FIELDS above — are checked against Master Data.
 * Sheet-backed sources are the actively-curated lists with hundreds of real
 * entries, where a typo (e.g. a POSITION not yet added to Master Data)
 * should block the row. Other fields backed by the generic "lookup" table
 * (Category, Gender, Religion, Seragam, ...) are small admin lists that
 * don't necessarily cover every legitimate value in use — a mismatch there
 * is left as plain text instead of rejected. BPJS KTK/KES are the one
 * exception: validated as dates (see DATE_ONLY_SYNC_FIELDS) since that's
 * what they actually hold, mismatch or not. A blank cell is always exempt —
 * same "sheet isn't managing this field" convention used elsewhere in this
 * file.
 */
function findMasterDataMismatches(
  incoming: EmployeeInput,
  casingByField: Map<string, Map<string, string>>,
): { field: string; label: string; value: string }[] {
  const mismatches: { field: string; label: string; value: string }[] = [];
  for (const [fieldKey, casingMap] of casingByField) {
    if (!EMPLOYEE_SYNC_FIELD_KEYS.includes(fieldKey)) continue;

    if (DATE_ONLY_SYNC_FIELDS.has(fieldKey)) {
      const normalized = normalizeSheetDate(norm(incoming[fieldKey]));
      if (!normalized) continue; // blank — sheet isn't managing this field
      if (!isValidIsoDate(normalized)) {
        const fieldMeta = EMPLOYEE_SYNC_FIELDS.find((f) => f.key === fieldKey);
        mismatches.push({ field: fieldKey, label: fieldMeta?.label ?? fieldKey, value: incoming[fieldKey] ?? "" });
      } else {
        incoming[fieldKey] = normalized;
      }
      continue;
    }

    const isStrict = FIELD_MASTER_DATA_SOURCE[fieldKey]?.kind === "sheet" || STRICT_LOOKUP_SYNC_FIELDS.has(fieldKey);
    if (!isStrict) continue;

    const raw = norm(incoming[fieldKey]);
    if (!raw || casingMap.has(raw.toLowerCase())) continue;
    const fieldMeta = EMPLOYEE_SYNC_FIELDS.find((f) => f.key === fieldKey);
    mismatches.push({ field: fieldKey, label: fieldMeta?.label ?? fieldKey, value: raw });
  }
  return mismatches;
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
 * (lib/contract-dates.ts), but treats a blank sheet cell the same way
 * STATUS's blank cell is treated above: "admin isn't managing this from the
 * sheet" — never a diff that would clear an existing value. For every slot,
 * a value already on the sheet row always wins; otherwise the existing
 * employee record's current value (if any) is copied back into `incoming`
 * so the diff comes out unchanged instead of "existing -> blank"; only when
 * BOTH are empty does the CONTRACT CRITERIA calculation fill it in. This
 * runs over all 5 slots, not just however many periods the matched criteria
 * has, so a slot beyond that criteria's period count is protected too.
 */
function applyContractCriteriaCalc(
  incoming: EmployeeInput,
  existing: EmployeeRecord | undefined,
  criteriaList: ContractCriteriaItem[],
): void {
  const criteria = criteriaList.find((c) => c.name === norm(incoming.contractCriteria) && c.periods.length > 0);
  const computed =
    criteria && norm(incoming.joinDate) ? calculateContractPeriodDates(incoming.joinDate, criteria.periods) : [];

  CONTRACT_CLOSE_KEYS.forEach((key, idx) => {
    if (norm(incoming[key])) return; // sheet explicitly set this slot — always wins
    const existingValue = existing ? norm(existing[key]) : "";
    if (existingValue) {
      incoming[key] = existingValue; // preserve — never silently clear a real value
      return;
    }
    const period = computed[idx];
    if (period) incoming[key] = period.endDate; // both blank — fill in from the criteria
  });
}

/**
 * The "Contract Periods" widget on the Employee Form (Settings > ... >
 * Contract Information) reads from the separate `contract_history` table,
 * NOT the CONTRACT CLOSE-FIRST/SECOND/... columns applyContractCriteriaCalc
 * fills above — those are two different places the same dates end up.
 * Seeds one contract_history row per computed period, but ONLY when the
 * employee has zero history rows yet, so this never touches real tracked
 * history (renewals, manual edits) once it exists — mirrors
 * EmployeeForm.tsx's syncAutoContractPeriods labeling (first period
 * "Probation" when CONTRACT STATUS is Probation, otherwise "Contract N").
 */
async function seedContractHistoryIfEmpty(
  employeeId: string,
  incoming: EmployeeInput,
  criteriaList: ContractCriteriaItem[],
): Promise<void> {
  const criteria = criteriaList.find((c) => c.name === norm(incoming.contractCriteria) && c.periods.length > 0);
  if (!criteria || !norm(incoming.joinDate)) return;

  const existingHistory = await getContractHistory(employeeId);
  if (existingHistory.length > 0) return;

  const computed = calculateContractPeriodDates(incoming.joinDate, criteria.periods);
  const statusNorm = norm(incoming.contractStatus).toLowerCase();
  let contractNum = 0;
  for (let idx = 0; idx < computed.length; idx++) {
    const contractType = idx === 0 && statusNorm === "probation" ? "Probation" : `Contract ${(contractNum += 1)}`;
    await createContractHistoryEntry(employeeId, {
      contractType,
      startDate: computed[idx].startDate,
      endDate: computed[idx].endDate,
    });
  }
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
  const unchangedRows: SyncUnchangedRow[] = [];

  for (const row of sheetRows) {
    const nik = norm(row.values.nik);
    const sheetName = norm(row.values.name);
    if (seenSheetNiks.has(nik)) {
      rejected.push({
        rowNumber: row.rowNumber,
        name: sheetName,
        reason: `Duplicate NIK "${nik}" in the sheet — a previous row already used this NIK.`,
      });
      continue;
    }
    seenSheetNiks.add(nik);

    const parsed = employeeSyncRowSchema.safeParse(row.values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rejected.push({ rowNumber: row.rowNumber, name: sheetName, reason: issue?.message ?? "Invalid row." });
      continue;
    }

    const incoming: EmployeeInput = { ...parsed.data };
    normalizeToMasterDataCasing(incoming, casingByField);

    const mismatches = findMasterDataMismatches(incoming, casingByField);
    if (mismatches.length > 0) {
      rejected.push({
        rowNumber: row.rowNumber,
        name: sheetName,
        reason: mismatches
          .map((m) =>
            DATE_ONLY_SYNC_FIELDS.has(m.field)
              ? `${m.label} "${m.value}" is not a valid date.`
              : `${m.label} "${m.value}" is not in Master Data.`,
          )
          .join(" "),
      });
      continue;
    }

    const existing = nikMap.get(nik);

    if (!existing) {
      // Brand-new employee: a blank STATUS cell defaults to Active (there's no
      // prior status to accidentally clear here, unlike the existing-row case below).
      if (!norm(incoming.status)) incoming.status = "Active";
      applyContractCriteriaCalc(incoming, undefined, criteriaList);
      if (norm(incoming.contractStatus).toLowerCase() === "permanent" && !norm(incoming.permanenDate)) {
        // No existing record to fall back on for a brand-new row — the sheet
        // itself has to supply PERMANEN DATE for this combination.
        rejected.push({
          rowNumber: row.rowNumber,
          name: sheetName,
          reason: "CONTRACT STATUS is Permanent but PERMANEN DATE is blank in the sheet.",
        });
        continue;
      }
      newRows.push({ rowNumber: row.rowNumber, nik, incoming });
      continue;
    }

    // A blank STATUS/PERMANEN DATE cell on an existing row means "admin isn't
    // managing this from the sheet for this row" — treat as no-op rather
    // than a diff that would clear it, and never send it to updateEmployee.
    const sheetStatusRaw = norm(incoming.status);
    if (!sheetStatusRaw) delete incoming.status;
    if (!norm(incoming.permanenDate)) delete incoming.permanenDate;

    applyContractCriteriaCalc(incoming, existing, criteriaList);

    if (
      norm(incoming.contractStatus).toLowerCase() === "permanent" &&
      !norm(incoming.permanenDate) &&
      !norm(existing.permanenDate)
    ) {
      rejected.push({
        rowNumber: row.rowNumber,
        name: sheetName,
        reason: "CONTRACT STATUS is Permanent but PERMANEN DATE is blank both in the sheet and on the dashboard.",
      });
      continue;
    }

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
      unchangedRows.push({ nik, name: norm(existing.name) || norm(incoming.name) });
      continue;
    }

    const entry: SyncChangedRow = { rowNumber: row.rowNumber, nik, recordId: existing.recordId, incoming, diffs };
    // Phase 2 note: matching is NIK-only for now — a future pre-NIK matching
    // key (hidden locked ID column) would extend the lookup above, not this
    // classification step.
    if (movingToInactive) inactivatedRows.push(entry);
    else changedRows.push(entry);
  }

  return { newRows, changedRows, inactivatedRows, rejected, unchangedRows, warnings };
}

interface MovementRowSummary {
  rowNumber: number;
  name: string;
  movementType: string;
  lastDepartment: string;
  newDepartment: string;
  effectiveDate: string;
}

export interface EmployeeSyncCommitSummary {
  createdCount: number;
  updatedCount: number;
  movedToInactiveCount: number;
  skippedCount: number;
  /** How many rows caused a "Permanent" Employee Movement History entry to be auto-logged (CONTRACT STATUS -> Permanent + PERMANEN DATE set). */
  permanentMovementsLoggedCount: number;
  /** New Promosi/Demosi/Mutasi entries created from the "Employee Movement History" sheet tab during this commit — named + typed so the admin sees exactly who moved and how, not just a bare count. */
  movementRowsAdded: MovementRowSummary[];
  /** Sheet rows that matched an identical existing entry (same employee, type, effective date, new department/position) — reported by name + type too, not silently skipped, so re-running sync still confirms what's already recorded instead of just going quiet. */
  movementRowsAlreadySynced: MovementRowSummary[];
  /** Movement History sheet rows that couldn't be applied — unknown NIK, invalid/blank MOVEMENT TYPE, or a Department/Position not in Master Data. Reported so the admin knows what to fix in the sheet. */
  movementRowsRejected: { rowNumber: number; name: string; reason: string }[];
  errors: { rowNumber: number; nik: string; message: string }[];
}

/**
 * Movement Type values accepted from the "Employee Movement History" sheet
 * — "Permanent" is deliberately excluded: that entry is exclusively
 * auto-logged from CONTRACT STATUS + PERMANEN DATE (see
 * autoLogPermanentMovement above) and must never be hand-entered from this
 * sheet, or the two mechanisms could create conflicting/duplicate rows.
 */
const SHEET_MOVEMENT_TYPES = new Map([
  ["promosi", "Promosi"],
  ["demosi", "Demosi"],
  ["mutasi", "Mutasi"],
]);

/**
 * Reads the "Employee Movement History" sheet tab and creates any
 * Promosi/Demosi/Mutasi entries not already recorded — runs automatically as
 * part of every Employee Sync commit (see commitEmployeeSync below), with no
 * separate preview/apply step of its own (unlike the main Employee rows).
 * Idempotent: a sheet row already represented by an identical existing entry
 * (same employee, movement type, effective date, new department/position) is
 * reported as "already synced" (not duplicated) — named + typed just like a
 * newly-added row, so re-running sync still visibly confirms the movement
 * instead of silently going quiet. If the sheet tab itself doesn't exist (or
 * the connection isn't configured), this is treated as "nothing to sync"
 * rather than failing the whole commit — this feature is additive, so a
 * missing/misnamed tab shouldn't block the main Employee sync.
 */
async function syncEmployeeMovementSheet(): Promise<{
  added: MovementRowSummary[];
  alreadySynced: MovementRowSummary[];
  rejected: { rowNumber: number; name: string; reason: string }[];
}> {
  let rows: Awaited<ReturnType<typeof readEmployeeMovementSyncSheet>>;
  try {
    rows = await readEmployeeMovementSyncSheet();
  } catch {
    return { added: [], alreadySynced: [], rejected: [] };
  }
  if (rows.length === 0) return { added: [], alreadySynced: [], rejected: [] };

  const [employees, casingByField] = await Promise.all([getEmployees(), buildMasterDataCasingMap()]);
  const nikMap = new Map<string, EmployeeRecord>();
  for (const emp of employees) {
    const nik = norm(emp.nik);
    if (nik && !nikMap.has(nik)) nikMap.set(nik, emp);
  }
  const deptCasing = casingByField.get("department");
  const posCasing = casingByField.get("position");

  const rejected: { rowNumber: number; name: string; reason: string }[] = [];
  const added: MovementRowSummary[] = [];
  const alreadySynced: MovementRowSummary[] = [];

  for (const row of rows) {
    const nik = norm(row.nik);
    const employee = nik ? nikMap.get(nik) : undefined;
    if (!employee) {
      rejected.push({ rowNumber: row.rowNumber, name: row.name, reason: `NIK "${nik}" does not match any employee on the dashboard.` });
      continue;
    }
    const displayName = row.name || employee.name;

    const movementType = SHEET_MOVEMENT_TYPES.get(norm(row.movementType).toLowerCase());
    if (!movementType) {
      rejected.push({
        rowNumber: row.rowNumber,
        name: displayName,
        reason: `MOVEMENT TYPE "${row.movementType}" must be one of Promosi, Demosi, or Mutasi.`,
      });
      continue;
    }

    const effectiveDate = norm(row.effectiveDate);
    if (!effectiveDate) {
      rejected.push({ rowNumber: row.rowNumber, name: displayName, reason: "EFECTIVE DATE is blank." });
      continue;
    }

    const newDeptRaw = norm(row.newDepartment);
    const newPosRaw = norm(row.newPosition);
    if (!newDeptRaw || !newPosRaw) {
      rejected.push({ rowNumber: row.rowNumber, name: displayName, reason: "New DEPARTMENT/POSITION is blank." });
      continue;
    }
    if (!deptCasing?.has(newDeptRaw.toLowerCase())) {
      rejected.push({ rowNumber: row.rowNumber, name: displayName, reason: `New DEPARTMENT "${newDeptRaw}" is not in Master Data.` });
      continue;
    }
    if (!posCasing?.has(newPosRaw.toLowerCase())) {
      rejected.push({ rowNumber: row.rowNumber, name: displayName, reason: `New POSITION "${newPosRaw}" is not in Master Data.` });
      continue;
    }

    // Last Department/Position default to the employee's current values when
    // the sheet leaves them blank (mirrors the dashboard's "Add Movement",
    // which auto-fills Last from the employee's current record).
    const lastDeptRaw = norm(row.lastDepartment) || norm(employee.department);
    const lastPosRaw = norm(row.lastPosition) || norm(employee.position);
    if (lastDeptRaw && !deptCasing?.has(lastDeptRaw.toLowerCase())) {
      rejected.push({ rowNumber: row.rowNumber, name: displayName, reason: `Last DEPARTMENT "${lastDeptRaw}" is not in Master Data.` });
      continue;
    }
    if (lastPosRaw && !posCasing?.has(lastPosRaw.toLowerCase())) {
      rejected.push({ rowNumber: row.rowNumber, name: displayName, reason: `Last POSITION "${lastPosRaw}" is not in Master Data.` });
      continue;
    }

    const newDepartment = deptCasing!.get(newDeptRaw.toLowerCase())!;
    const newPosition = posCasing!.get(newPosRaw.toLowerCase())!;
    const lastDepartment = (lastDeptRaw && deptCasing!.get(lastDeptRaw.toLowerCase())) || lastDeptRaw;
    const lastPosition = (lastPosRaw && posCasing!.get(lastPosRaw.toLowerCase())) || lastPosRaw;

    const existingHistory = await getMovementHistory(employee.recordId);
    const alreadyExists = existingHistory.some(
      (m) =>
        m.movementType === movementType &&
        m.effectiveDate === effectiveDate &&
        m.newDepartment === newDepartment &&
        m.newPosition === newPosition,
    );
    if (alreadyExists) {
      alreadySynced.push({ rowNumber: row.rowNumber, name: displayName, movementType, lastDepartment, newDepartment, effectiveDate });
      continue;
    }

    await createMovementEntry(employee.recordId, {
      movementType,
      effectiveDate,
      lastDepartment,
      lastPosition,
      newDepartment,
      newPosition,
    });
    added.push({ rowNumber: row.rowNumber, name: displayName, movementType, lastDepartment, newDepartment, effectiveDate });
  }

  return { added, alreadySynced, rejected };
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
  const summary: EmployeeSyncCommitSummary = {
    createdCount: 0,
    updatedCount: 0,
    movedToInactiveCount: 0,
    skippedCount: 0,
    permanentMovementsLoggedCount: 0,
    movementRowsAdded: [],
    movementRowsAlreadySynced: [],
    movementRowsRejected: [],
    errors: [],
  };
  const criteriaList = await getContractCriteria({ activeOnly: true });

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
      const created = await createEmployee(row.incoming);
      await seedContractHistoryIfEmpty(created.recordId, row.incoming, criteriaList);
      const loggedPermanent = await autoLogPermanentMovement(
        created.recordId,
        "",
        created.contractStatus,
        created.department,
        created.position,
        created.permanenDate,
      );
      if (loggedPermanent) summary.permanentMovementsLoggedCount += 1;
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
      const updated = await updateEmployee(row.recordId, row.incoming);
      await seedContractHistoryIfEmpty(row.recordId, row.incoming, criteriaList);
      // previousContractStatus is passed blank ("") rather than tracked precisely —
      // autoLogPermanentMovement's own "already logged?" check (by movementType,
      // not by this flag) is what actually prevents a duplicate entry on repeat syncs.
      const loggedPermanent = await autoLogPermanentMovement(
        row.recordId,
        "",
        updated.contractStatus,
        updated.department,
        updated.position,
        updated.permanenDate,
      );
      if (loggedPermanent) summary.permanentMovementsLoggedCount += 1;
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

  const movementSync = await syncEmployeeMovementSheet();
  summary.movementRowsAdded = movementSync.added;
  summary.movementRowsAlreadySynced = movementSync.alreadySynced;
  summary.movementRowsRejected = movementSync.rejected;

  return summary;
}
