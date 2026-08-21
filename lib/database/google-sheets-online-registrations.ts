import "server-only";

import { EMPLOYEES_SHEET_NAME, EMPLOYEE_FIELDS, EXTRA_EMPLOYEE_FIELDS } from "@/config/employee-fields";
import {
  ONLINE_REGISTRATIONS_SHEET_NAME,
  ONLINE_REGISTRATIONS_SHEET_HEADERS,
  ONLINE_REGISTRATIONS_LAST_COLUMN,
} from "@/config/master-data-sheets";
import { readSheet, appendRow, updateRow, deleteRow, ensureSheetWithHeaders } from "@/lib/google-sheets";
import {
  ALL_EMPLOYEE_COLUMNS,
  isBlankRow,
  rowToEmployee,
  employeeToRow,
  ensureEmployeesSheet,
  getExistingFingerCodes,
} from "@/lib/database/google-sheets-adapter";
import { generateFingerCode } from "@/lib/database/finger-code";
import { RecordNotFoundError } from "@/lib/database/errors";
import {
  RegistrationIncompleteError,
  RegistrationAlreadyDecidedError,
  RegistrationAlreadySubmittedError,
} from "@/lib/database/online-registration-errors";
import type { EmployeeInput } from "@/lib/database/types";
import type { OnlineRegistration, SourcePlatform, InviteRegistrationInput } from "@/lib/database/sqlite-online-registrations";

export type { OnlineRegistration, SourcePlatform, InviteRegistrationInput };
export { RegistrationIncompleteError, RegistrationAlreadyDecidedError, RegistrationAlreadySubmittedError };

/**
 * Google Sheets implementation of Online Register storage — mirrors
 * lib/database/sqlite-online-registrations.ts function-for-function. The
 * `Online_Registrations` sheet is shaped exactly like `Employees` (reuses
 * ALL_EMPLOYEE_COLUMNS / rowToEmployee / employeeToRow) plus 3 trailing
 * columns: REGISTRATION_STATUS, SOURCE_PLATFORM, SUBMITTED_AT.
 */

const EXTRA_START = ALL_EMPLOYEE_COLUMNS.length; // index of REGISTRATION_STATUS

/** Real, user-writable Employee fields only — excludes SYSTEM_FIELDS (recordId/createdAt/updatedAt), which input payloads never carry and must not be blanked out by a naive input-copy loop. */
const WRITABLE_FIELDS = [...EMPLOYEE_FIELDS, ...EXTRA_EMPLOYEE_FIELDS];

async function ensureRegistrationsSheet(): Promise<void> {
  await ensureSheetWithHeaders(ONLINE_REGISTRATIONS_SHEET_NAME, ONLINE_REGISTRATIONS_SHEET_HEADERS);
}

function rowToRegistration(row: string[]): OnlineRegistration {
  const record = rowToEmployee(row);
  const sourcePlatform = row[EXTRA_START + 1] ?? "";
  return {
    ...record,
    registrationStatus: row[EXTRA_START] || "Pending",
    sourcePlatform: sourcePlatform === "walkin" || sourcePlatform === "direct_link" ? (sourcePlatform as SourcePlatform) : "",
    submittedAt: row[EXTRA_START + 2] ?? "",
  };
}

function registrationToRow(reg: OnlineRegistration): string[] {
  return [...employeeToRow(reg), reg.registrationStatus, reg.sourcePlatform, reg.submittedAt];
}

async function readRegistrationRows(): Promise<string[][]> {
  await ensureRegistrationsSheet();
  const rows = await readSheet(ONLINE_REGISTRATIONS_SHEET_NAME, `A2:${ONLINE_REGISTRATIONS_LAST_COLUMN}`);
  return rows.filter((r) => !isBlankRow(r));
}

export async function getOnlineRegistrations(): Promise<OnlineRegistration[]> {
  const rows = await readRegistrationRows();
  return rows.map(rowToRegistration).reverse(); // newest first, matching SQLite's `ORDER BY id DESC`
}

async function findRegistrationRow(
  recordId: string,
): Promise<{ registration: OnlineRegistration; rowNumber: number } | null> {
  const rows = await readRegistrationRows();
  const recordIdIdx = ALL_EMPLOYEE_COLUMNS.findIndex((f) => f.key === "recordId");
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][recordIdIdx] === recordId) {
      return { registration: rowToRegistration(rows[i]), rowNumber: i + 2 };
    }
  }
  return null;
}

export async function getOnlineRegistrationById(recordId: string): Promise<OnlineRegistration | null> {
  const found = await findRegistrationRow(recordId);
  return found?.registration ?? null;
}

function blankRegistration(recordId: string, now: string): OnlineRegistration {
  const reg = { recordId, createdAt: now, updatedAt: now } as OnlineRegistration;
  for (const field of ALL_EMPLOYEE_COLUMNS) {
    if (reg[field.key] === undefined) reg[field.key] = "";
  }
  reg.registrationStatus = "Pending";
  reg.sourcePlatform = "";
  reg.submittedAt = "";
  return reg;
}

/** Full manual HR entry (legacy — current UI uses the invite-link flow instead, kept for API parity). */
export async function createOnlineRegistration(input: EmployeeInput): Promise<OnlineRegistration> {
  await ensureRegistrationsSheet();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();
  const reg = blankRegistration(recordId, now);
  for (const field of WRITABLE_FIELDS) {
    if (field.readOnly || field.key === "fingerCode") continue;
    reg[field.key] = input[field.key] ?? "";
  }
  reg.sourcePlatform = "direct_link";

  await appendRow(ONLINE_REGISTRATIONS_SHEET_NAME, registrationToRow(reg));
  return reg;
}

/** Walk-in QR — the applicant fills in and submits everything in one step, so `submittedAt` is set immediately. */
export async function createWalkInApplication(input: EmployeeInput): Promise<OnlineRegistration> {
  await ensureRegistrationsSheet();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();
  const reg = blankRegistration(recordId, now);
  for (const field of WRITABLE_FIELDS) {
    if (field.readOnly || field.key === "fingerCode") continue;
    reg[field.key] = input[field.key] ?? "";
  }
  reg.sourcePlatform = "walkin";
  reg.submittedAt = now;

  await appendRow(ONLINE_REGISTRATIONS_SHEET_NAME, registrationToRow(reg));
  return reg;
}

/** Minimal Name/HP Number/Position row — the basis of a shareable invite link, status "Sent" until the candidate submits. */
export async function createInviteRegistration(input: InviteRegistrationInput): Promise<OnlineRegistration> {
  await ensureRegistrationsSheet();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();
  const reg = blankRegistration(recordId, now);
  reg.name = input.name;
  reg.hpNumber = input.hpNumber;
  reg.position = input.position;
  reg.registrationStatus = "Sent";
  reg.sourcePlatform = "direct_link";

  await appendRow(ONLINE_REGISTRATIONS_SHEET_NAME, registrationToRow(reg));
  return reg;
}

/**
 * Called from the public /apply/[token] page. Re-validates the invite is
 * still "Sent" and force-preserves name/hpNumber/position regardless of the
 * payload, then flips status to "Pending" and stamps submittedAt.
 */
export async function submitPublicApplication(token: string, input: EmployeeInput): Promise<OnlineRegistration> {
  const found = await findRegistrationRow(token);
  if (!found) throw new RecordNotFoundError("Online Registration", token);
  const { registration, rowNumber } = found;

  if (registration.registrationStatus.toLowerCase() !== "sent") {
    if (registration.submittedAt || registration.registrationStatus.toLowerCase() === "pending") {
      throw new RegistrationAlreadySubmittedError();
    }
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  const updated: OnlineRegistration = { ...registration };
  for (const field of WRITABLE_FIELDS) {
    if (field.readOnly || field.key === "fingerCode") continue;
    if (field.key === "name" || field.key === "hpNumber" || field.key === "position") continue; // locked
    if (input[field.key] !== undefined) updated[field.key] = input[field.key];
  }
  const now = new Date().toISOString();
  updated.registrationStatus = "Pending";
  updated.submittedAt = now;
  updated.updatedAt = now;

  await updateRow(ONLINE_REGISTRATIONS_SHEET_NAME, rowNumber, registrationToRow(updated), ONLINE_REGISTRATIONS_LAST_COLUMN);
  return updated;
}

export async function updateOnlineRegistration(recordId: string, input: EmployeeInput): Promise<OnlineRegistration> {
  const found = await findRegistrationRow(recordId);
  if (!found) throw new RecordNotFoundError("Online Registration", recordId);

  const updated: OnlineRegistration = { ...found.registration, updatedAt: new Date().toISOString() };
  for (const field of WRITABLE_FIELDS) {
    if (field.readOnly || field.key === "fingerCode") continue;
    if (input[field.key] !== undefined) updated[field.key] = input[field.key];
  }

  await updateRow(
    ONLINE_REGISTRATIONS_SHEET_NAME,
    found.rowNumber,
    registrationToRow(updated),
    ONLINE_REGISTRATIONS_LAST_COLUMN,
  );
  return updated;
}

/** Permanently removes a registration row. Doesn't touch `Employees` — an already-Approved registration's employee record is untouched. */
export async function deleteOnlineRegistration(recordId: string): Promise<void> {
  const found = await findRegistrationRow(recordId);
  if (!found) throw new RecordNotFoundError("Online Registration", recordId);
  await deleteRow(ONLINE_REGISTRATIONS_SHEET_NAME, found.rowNumber);
}

const REQUIRED_FOR_APPROVAL: { key: string; label: string }[] = [
  { key: "nik", label: "NIK" },
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "joinDate", label: "Join Date" },
];

/**
 * Copies a Pending registration's fields into a brand-new `Employees` row,
 * then marks it Approved. Unlike the SQLite version's BEGIN/COMMIT
 * transaction, Sheets has no atomic multi-write — if the second write
 * (marking the registration Approved) fails after the first (creating the
 * employee) succeeds, the registration is left stuck on "Pending" with a
 * real employee already created. Re-approving is safe: it would fail
 * loudly (duplicate finger code risk is avoided since the second attempt
 * re-reads existing codes), so this is a visible failure, not silent data
 * loss.
 */
export async function approveOnlineRegistration(recordId: string): Promise<{ employeeRecordId: string }> {
  const found = await findRegistrationRow(recordId);
  if (!found) throw new RecordNotFoundError("Online Registration", recordId);
  const { registration } = found;
  if (registration.registrationStatus.toLowerCase() !== "pending") {
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  const missing = REQUIRED_FOR_APPROVAL.filter((f) => !registration[f.key]?.trim()).map((f) => f.label);
  if (missing.length > 0) throw new RegistrationIncompleteError(missing);

  await ensureEmployeesSheet();
  const now = new Date().toISOString();
  const employeeRecordId = crypto.randomUUID();
  const fingerCode = generateFingerCode(registration.joinDate, await getExistingFingerCodes());

  const employee = { ...registration, recordId: employeeRecordId, createdAt: now, updatedAt: now, fingerCode };
  await appendRow(EMPLOYEES_SHEET_NAME, employeeToRow(employee));

  const updated: OnlineRegistration = { ...registration, registrationStatus: "Approved", updatedAt: now };
  await updateRow(
    ONLINE_REGISTRATIONS_SHEET_NAME,
    found.rowNumber,
    registrationToRow(updated),
    ONLINE_REGISTRATIONS_LAST_COLUMN,
  );

  return { employeeRecordId };
}

export async function rejectOnlineRegistration(recordId: string): Promise<OnlineRegistration> {
  const found = await findRegistrationRow(recordId);
  if (!found) throw new RecordNotFoundError("Online Registration", recordId);
  if (found.registration.registrationStatus.toLowerCase() !== "pending") {
    throw new RegistrationAlreadyDecidedError(found.registration.registrationStatus);
  }

  const updated: OnlineRegistration = {
    ...found.registration,
    registrationStatus: "Rejected",
    updatedAt: new Date().toISOString(),
  };
  await updateRow(
    ONLINE_REGISTRATIONS_SHEET_NAME,
    found.rowNumber,
    registrationToRow(updated),
    ONLINE_REGISTRATIONS_LAST_COLUMN,
  );
  return updated;
}
