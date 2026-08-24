import "server-only";

import { getSqliteDb } from "@/lib/database/sqlite-connection";
import { EMPLOYEE_COLUMNS, WRITABLE_EMPLOYEE_COLUMNS } from "@/lib/database/sqlite-columns";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { generateFingerCode } from "@/lib/database/finger-code";
import { RecordNotFoundError } from "@/lib/database/errors";
import {
  RegistrationIncompleteError,
  RegistrationAlreadyDecidedError,
  RegistrationAlreadySubmittedError,
} from "@/lib/database/online-registration-errors";
import type { EmployeeRecord, EmployeeInput, ApplicantAccessChannel, NewHiringLinkStatus, DuplicateCheckResult } from "@/lib/database/types";

export { RegistrationIncompleteError, RegistrationAlreadyDecidedError, RegistrationAlreadySubmittedError };

/**
 * Online Register storage — candidate drafts, shaped exactly like
 * `employees` (see ensureOnlineRegistrationsEmployeeShaped in
 * sqlite-init.ts) plus a `registrationStatus`: Sent (invite link generated,
 * not yet filled in) -> Pending (candidate submitted, awaiting HR review)
 * -> Approved/Rejected. Walk-in QR submissions and legacy manual entries
 * skip "Sent" and start directly at Pending, since they're already complete
 * the moment the row exists. The same EmployeeForm UI edits a registration
 * and a real employee; approving one copies its row into `employees` via
 * `createEmployeeFromInput`.
 */

type SqlRow = Record<string, unknown>;

/** How the registration reached Online Register — shown in the table instead of the old free-text "Category" field. */
export type SourcePlatform = "walkin" | "direct_link";

export interface OnlineRegistration extends EmployeeRecord {
  registrationStatus: string;
  /** ISO timestamp set once the candidate submits the public /apply form; blank while the link is still unfilled. */
  submittedAt: string;
  sourcePlatform: SourcePlatform | "";
  candidateNumber: string;
  accessChannel: ApplicantAccessChannel | "";
  duplicateCheckResult: string;
  ocrSourceDocumentId: string;
  newHiringLinkToken: string;
  newHiringLinkExpiry: string;
  newHiringLinkStatus: NewHiringLinkStatus | "";
  approvedBy: string;
  approvedAt: string;
  archivedAt: string;
  migratedEmployeeRecordId: string;
  newHiringLinkCreatedAt: string;
  newHiringLinkAccessedAt: string;
  newHiringLinkUsedAt: string;
  newHiringLinkRevokedAt: string;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function rowToRegistration(row: SqlRow): OnlineRegistration {
  const record = {
    recordId: str(row.record_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  } as EmployeeRecord;

  for (const c of EMPLOYEE_COLUMNS) {
    record[c.key] = str(row[c.column]);
  }

  const age = calculateAge(record.birthDate);
  record.age = age !== null ? String(age) : "";
  record.masaKerja = calculateMasaKerja(record.joinDate) ?? "";

  const sourcePlatform = str(row.source_platform);
  return {
    ...record,
    registrationStatus: str(row.registration_status) || "Pending",
    submittedAt: str(row.submitted_at),
    sourcePlatform: sourcePlatform === "walkin" || sourcePlatform === "direct_link" ? sourcePlatform : "",
    candidateNumber: str(row.candidate_number),
    accessChannel: ["applicant_pool_qr", "new_hiring_qr_nik", "new_hiring_link"].includes(str(row.access_channel))
      ? str(row.access_channel) as ApplicantAccessChannel : "",
    duplicateCheckResult: str(row.duplicate_check_result),
    ocrSourceDocumentId: str(row.ocr_source_document_id),
    newHiringLinkToken: str(row.new_hiring_link_token),
    newHiringLinkExpiry: str(row.new_hiring_link_expiry),
    newHiringLinkStatus: ["active", "used", "expired", "revoked"].includes(str(row.new_hiring_link_status))
      ? str(row.new_hiring_link_status) as NewHiringLinkStatus : "",
    approvedBy: str(row.approved_by),
    approvedAt: str(row.approved_at),
    archivedAt: str(row.archived_at),
    migratedEmployeeRecordId: str(row.migrated_employee_record_id),
    newHiringLinkCreatedAt: str(row.new_hiring_link_created_at),
    newHiringLinkAccessedAt: str(row.new_hiring_link_accessed_at),
    newHiringLinkUsedAt: str(row.new_hiring_link_used_at),
    newHiringLinkRevokedAt: str(row.new_hiring_link_revoked_at),
  };
}

export function getOnlineRegistrations(): OnlineRegistration[] {
  const db = getSqliteDb();
  const rows = db.prepare("SELECT * FROM online_registrations ORDER BY id DESC").all() as SqlRow[];
  return rows.map(rowToRegistration);
}

export function getOnlineRegistrationById(recordId: string): OnlineRegistration | null {
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM online_registrations WHERE record_id = ?").get(recordId) as
    | SqlRow
    | undefined;
  return row ? rowToRegistration(row) : null;
}

/** Generates MODMMHHXXX using an atomic, permanent counter per MMHH bucket. */
function generateCandidateNumber(db: ReturnType<typeof getSqliteDb>, now: Date): string {
  const key = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}`;
  const timestamp = now.toISOString();
  db.prepare(`INSERT INTO candidate_number_sequences(sequence_key, last_value, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(sequence_key) DO UPDATE SET last_value = last_value + 1, updated_at = excluded.updated_at`).run(key, timestamp);
  const row = db.prepare("SELECT last_value FROM candidate_number_sequences WHERE sequence_key = ?").get(key) as { last_value: number };
  if (row.last_value > 999) throw new Error(`Candidate number capacity exhausted for ${key}.`);
  return `MOD${key}${String(row.last_value).padStart(3, "0")}`;
}

/**
 * Creates a new Pending draft. Until the public self-service form exists,
 * this is how HR enters a registration manually — same fields as Add
 * Employee, but it lands in Online Register for review first instead of
 * becoming an employee immediately.
 */
export function createOnlineRegistration(input: EmployeeInput): OnlineRegistration {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();

  const columns = [
    "record_id",
    ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column),
    "registration_status",
    "source_platform",
    "created_at",
    "updated_at",
  ];
  const values: string[] = [
    recordId,
    ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => (c.key === "fingerCode" ? "" : input[c.key] ?? "")),
    "Pending",
    "direct_link",
    now,
    now,
  ];
  const placeholders = columns.map(() => "?").join(", ");

  db.prepare(`INSERT INTO online_registrations (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);

  return getOnlineRegistrationById(recordId)!;
}

/**
 * Creates a Pending registration from the fixed walk-in QR code / link — the
 * applicant fills in and submits everything themselves in one step (unlike
 * an HR-generated invite, there's no separate "link sent, not yet filled"
 * phase), so `submitted_at` is set immediately.
 */
export function createWalkInApplication(input: EmployeeInput): OnlineRegistration {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();
  const candidateNumber = generateCandidateNumber(db, new Date());

  const columns = [
    "record_id",
    "candidate_number",
    ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column),
    "registration_status",
    "source_platform",
    "submitted_at",
    "created_at",
    "updated_at",
  ];
  const values: string[] = [
    recordId,
    candidateNumber,
    ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => (c.key === "fingerCode" ? "" : input[c.key] ?? "")),
    "applicant_pool",
    "walkin",
    now,
    now,
    now,
  ];
  const placeholders = columns.map(() => "?").join(", ");

  db.prepare(`INSERT INTO online_registrations (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);

  return getOnlineRegistrationById(recordId)!;
}

export interface InviteRegistrationInput {
  name: string;
  hpNumber: string;
  position: string;
}

/**
 * Creates a minimal "Sent" registration from just Name/HP Number/Position —
 * the basis of a shareable invite link. The row's `record_id` (a random
 * UUID) doubles as the public, unguessable token used in /apply/[token].
 * Every other Employee-shaped column stays blank until the candidate fills
 * in the public form and submits, which flips the status to "Pending" (see
 * submitPublicApplication) — "Sent" means the link exists but hasn't been
 * filled in yet, "Pending" means it's awaiting HR review.
 */
export function createInviteRegistration(input: InviteRegistrationInput): OnlineRegistration {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO online_registrations
       (record_id, name, hp_number, position, registration_status, source_platform, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Sent', 'direct_link', '', ?, ?)`,
  ).run(recordId, input.name, input.hpNumber, input.position, now, now);

  return getOnlineRegistrationById(recordId)!;
}

/**
 * Called from the public /apply/[token] page. `token` is the registration's
 * `record_id`. Re-validates server-side that the invite is still open
 * ("Sent", not yet submitted) and force-preserves the HR-set name/HP
 * number/position regardless of what the client payload contains, so a
 * tampered request can't overwrite the fields the link was generated for.
 * On success, flips the status from "Sent" to "Pending" — the candidate has
 * now submitted and it's awaiting HR review.
 */
export function submitPublicApplication(token: string, input: EmployeeInput): OnlineRegistration {
  const db = getSqliteDb();
  const registration = getOnlineRegistrationById(token);
  if (!registration) throw new RecordNotFoundError("Online Registration", token);
  if (registration.registrationStatus.toLowerCase() !== "sent") {
    if (registration.submittedAt || registration.registrationStatus.toLowerCase() === "pending") {
      throw new RegistrationAlreadySubmittedError();
    }
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  const setClauses: string[] = [];
  const values: string[] = [];
  for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
    if (c.key === "fingerCode") continue; // only generated once an employee is actually created
    if (c.key === "name" || c.key === "hpNumber" || c.key === "position") {
      // Locked on the public form — always keep what HR set when the link was generated.
      continue;
    }
    if (input[c.key] !== undefined) {
      setClauses.push(`${c.column} = ?`);
      values.push(input[c.key]);
    }
  }
  const now = new Date().toISOString();
  setClauses.push("registration_status = ?", "submitted_at = ?", "updated_at = ?");
  values.push("Pending", now, now);

  db.prepare(`UPDATE online_registrations SET ${setClauses.join(", ")} WHERE record_id = ?`).run(
    ...values,
    token,
  );

  return getOnlineRegistrationById(token)!;
}

/** Permanently removes a registration row. Doesn't touch `employees` — an already-Approved registration's employee record is untouched. */
export function deleteOnlineRegistration(recordId: string): void {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM online_registrations WHERE record_id = ?").get(recordId);
  if (!existing) throw new RecordNotFoundError("Online Registration", recordId);

  db.prepare("DELETE FROM online_registrations WHERE record_id = ?").run(recordId);
}

export function updateOnlineRegistration(recordId: string, input: EmployeeInput): OnlineRegistration {
  const db = getSqliteDb();
  const existing = db.prepare("SELECT id FROM online_registrations WHERE record_id = ?").get(recordId);
  if (!existing) throw new RecordNotFoundError("Online Registration", recordId);

  const setClauses: string[] = [];
  const values: string[] = [];
  for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
    if (c.key === "fingerCode") continue; // only generated once an employee is actually created
    if (input[c.key] !== undefined) {
      setClauses.push(`${c.column} = ?`);
      values.push(input[c.key]);
    }
  }
  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());

  db.prepare(`UPDATE online_registrations SET ${setClauses.join(", ")} WHERE record_id = ?`).run(
    ...values,
    recordId,
  );

  return getOnlineRegistrationById(recordId)!;
}

const REQUIRED_FOR_APPROVAL: { key: string; label: string }[] = [
  { key: "nik", label: "NIK" },
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "joinDate", label: "Join Date" },
];

/** Copies a Pending registration's fields into a brand-new `employees` row (same as creating an employee), then marks it Approved. */
export function approveOnlineRegistration(recordId: string): { employeeRecordId: string } {
  const db = getSqliteDb();
  const registration = getOnlineRegistrationById(recordId);
  if (!registration) throw new RecordNotFoundError("Online Registration", recordId);
  if (registration.registrationStatus.toLowerCase() === "approved" && registration.migratedEmployeeRecordId) {
    return { employeeRecordId: registration.migratedEmployeeRecordId };
  }
  if (registration.registrationStatus.toLowerCase() !== "pending") {
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  const missing = REQUIRED_FOR_APPROVAL.filter((f) => !registration[f.key]?.trim()).map((f) => f.label);
  if (missing.length > 0) throw new RegistrationIncompleteError(missing);

  const duplicateNik = db.prepare("SELECT record_id FROM employees WHERE trim(nik) = trim(?) LIMIT 1").get(registration.nik) as { record_id: string } | undefined;
  if (duplicateNik) throw new Error("NIK sudah terdaftar di employees.");

  const now = new Date().toISOString();
  const employeeRecordId = crypto.randomUUID();

  const existingFingerCodes = db.prepare("SELECT finger_code FROM employees").all() as { finger_code: string }[];
  const fingerCode = generateFingerCode(registration.joinDate, existingFingerCodes.map((r) => r.finger_code));

  const columns = ["record_id", ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column), "created_at", "updated_at"];
  const values: string[] = [
    employeeRecordId,
    ...WRITABLE_EMPLOYEE_COLUMNS.map((c) => (c.key === "fingerCode" ? fingerCode : registration[c.key] ?? "")),
    now,
    now,
  ];
  const placeholders = columns.map(() => "?").join(", ");

  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO employees (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);
    db.prepare("UPDATE online_registrations SET registration_status = 'Approved', approved_at = ?, archived_at = ?, migrated_employee_record_id = ?, updated_at = ? WHERE record_id = ? AND lower(registration_status) = 'pending'").run(
      now,
      now,
      employeeRecordId,
      now,
      recordId,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { employeeRecordId };
}

export function rejectOnlineRegistration(recordId: string): OnlineRegistration {
  const db = getSqliteDb();
  const registration = getOnlineRegistrationById(recordId);
  if (!registration) throw new RecordNotFoundError("Online Registration", recordId);
  if (registration.registrationStatus.toLowerCase() !== "pending") {
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  db.prepare("UPDATE online_registrations SET registration_status = 'Rejected', updated_at = ? WHERE record_id = ?").run(
    new Date().toISOString(),
    recordId,
  );
  return getOnlineRegistrationById(recordId)!;
}
