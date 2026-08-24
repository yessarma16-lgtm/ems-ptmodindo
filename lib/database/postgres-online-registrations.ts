import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { EMPLOYEE_COLUMNS, WRITABLE_EMPLOYEE_COLUMNS } from "@/lib/database/sqlite-columns";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { calculateProbationEndDate } from "@/lib/contract-dates";
import { generateFingerCode } from "@/lib/database/finger-code";
import { createActivityLog } from "@/lib/database/postgres-activity-log";
import { RecordNotFoundError } from "@/lib/database/errors";
import {
  RegistrationIncompleteError,
  RegistrationAlreadyDecidedError,
  RegistrationAlreadySubmittedError,
} from "@/lib/database/online-registration-errors";
import type { EmployeeInput } from "@/lib/database/types";
import type { ApplicantAccessChannel, DuplicateCheckResult, ApplicantPreviousJob } from "@/lib/database/types";
import type { OnlineRegistration, SourcePlatform, InviteRegistrationInput } from "@/lib/database/sqlite-online-registrations";

export { RegistrationIncompleteError, RegistrationAlreadyDecidedError, RegistrationAlreadySubmittedError };
export type { OnlineRegistration, SourcePlatform, InviteRegistrationInput };

/**
 * Online Register storage — Postgres (Supabase) mirror of
 * lib/database/sqlite-online-registrations.ts. `approveOnlineRegistration`
 * calls the `approve_online_registration` Postgres function (created by
 * `npm run db:init:postgres`, see postgres-init.ts) so the employee-insert +
 * registration-status-update happen in one atomic transaction — the Sheets
 * version explicitly could not guarantee this; SQLite gets it via
 * BEGIN/COMMIT/ROLLBACK.
 */

type SqlRow = Record<string, unknown>;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function rowToRegistration(row: SqlRow): OnlineRegistration {
  const record = {
    recordId: str(row.record_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  } as OnlineRegistration;

  for (const c of EMPLOYEE_COLUMNS) {
    record[c.key] = str(row[c.column]);
  }

  const age = calculateAge(record.birthDate);
  record.age = age !== null ? String(age) : "";
  record.masaKerja = calculateMasaKerja(record.joinDate) ?? "";

  const sourcePlatform = str(row.source_platform);
  record.registrationStatus = str(row.registration_status) || "Pending";
  record.submittedAt = str(row.submitted_at);
  record.sourcePlatform = sourcePlatform === "walkin" || sourcePlatform === "direct_link" ? sourcePlatform : "";
  record.candidateNumber = str(row.candidate_number);
  record.accessChannel = ["applicant_pool_qr", "new_hiring_qr_nik", "new_hiring_link"].includes(str(row.access_channel))
    ? str(row.access_channel) as OnlineRegistration["accessChannel"] : "";
  record.duplicateCheckResult = str(row.duplicate_check_result);
  record.ocrSourceDocumentId = str(row.ocr_source_document_id);
  record.newHiringLinkToken = str(row.new_hiring_link_token);
  record.newHiringLinkExpiry = str(row.new_hiring_link_expiry);
  record.newHiringLinkStatus = ["active", "used", "expired", "revoked"].includes(str(row.new_hiring_link_status))
    ? str(row.new_hiring_link_status) as OnlineRegistration["newHiringLinkStatus"] : "";
  record.approvedBy = str(row.approved_by);
  record.approvedAt = str(row.approved_at);
  record.archivedAt = str(row.archived_at);
  record.migratedEmployeeRecordId = str(row.migrated_employee_record_id);
  record.newHiringLinkCreatedAt = str(row.new_hiring_link_created_at);
  record.newHiringLinkAccessedAt = str(row.new_hiring_link_accessed_at);
  record.newHiringLinkUsedAt = str(row.new_hiring_link_used_at);
  record.newHiringLinkRevokedAt = str(row.new_hiring_link_revoked_at);
  return record;
}

export async function getOnlineRegistrations(): Promise<OnlineRegistration[]> {
  return supabaseGuarded(async () => {
    // PostgREST caps a single response at 1000 rows — page through in case
    // recruitment history ever grows past that (see the same fix in
    // postgres-adapter.ts's getEmployees(), which is what surfaced this).
    // Pages are requested in parallel, not one after another — sequential
    // awaiting is what made the Employees list slow once it crossed
    // thousands of rows.
    const client = getSupabaseClient();
    const PAGE_SIZE = 1000;
    const { count, error: countError } = await client
      .from("online_registrations")
      .select("*", { count: "exact", head: true });
    if (countError) throw countError;
    const total = count ?? 0;
    if (total === 0) return [];

    const pageCount = Math.ceil(total / PAGE_SIZE);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) => {
        const from = i * PAGE_SIZE;
        return client
          .from("online_registrations")
          .select("*")
          .order("id", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
      }),
    );

    const all: SqlRow[] = [];
    for (const page of pages) {
      if (page.error) throw page.error;
      all.push(...(page.data as SqlRow[]));
    }
    return all.map(rowToRegistration);
  });
}

export async function getOnlineRegistrationById(recordId: string): Promise<OnlineRegistration | null> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("online_registrations")
      .select("*")
      .eq("record_id", recordId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToRegistration(data as SqlRow) : null;
  });
}

/**
 * Creates a new Pending draft. Until the public self-service form exists,
 * this is how HR enters a registration manually — same fields as Add
 * Employee, but it lands in Online Register for review first instead of
 * becoming an employee immediately.
 */
export async function createOnlineRegistration(input: EmployeeInput): Promise<OnlineRegistration> {
  return supabaseGuarded(async () => {
    const row: SqlRow = { registration_status: "Pending", source_platform: "direct_link" };
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) row[c.column] = c.key === "fingerCode" ? "" : input[c.key] ?? "";

    const { data, error } = await getSupabaseClient().from("online_registrations").insert(row).select().single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

/**
 * Creates a Pending registration from the fixed walk-in QR code / link — the
 * applicant fills in and submits everything themselves in one step, so
 * `submitted_at` is set immediately.
 */
export async function createWalkInApplication(input: EmployeeInput): Promise<OnlineRegistration> {
  return supabaseGuarded(async () => {
    const now = new Date().toISOString();
    const { data: number, error: numberError } = await getSupabaseClient().rpc("next_applicant_candidate_number");
    if (numberError) throw numberError;
    const row: SqlRow = { candidate_number: number, registration_status: "applicant_pool", source_platform: "walkin", access_channel: "applicant_pool_qr", submitted_at: now };
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) row[c.column] = c.key === "fingerCode" ? "" : input[c.key] ?? "";

    const { data, error } = await getSupabaseClient().from("online_registrations").insert(row).select().single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

export async function createNewHiringQrApplication(input: EmployeeInput): Promise<OnlineRegistration> {
  return supabaseGuarded(async () => {
    const now = new Date().toISOString();
    const row: SqlRow = { registration_status: "pending", source_platform: "direct_link", access_channel: "new_hiring_qr_nik", submitted_at: now };
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) row[c.column] = c.key === "fingerCode" ? "" : input[c.key] ?? "";
    const { data, error } = await getSupabaseClient().from("online_registrations").insert(row).select().single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

export interface NikVerificationResult {
  duplicate: boolean;
  duplicateCheckResult: DuplicateCheckResult;
  applicantPoolId: string | null;
}

export async function verifyNewHiringNik(nik: string): Promise<NikVerificationResult> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const checkedAt = new Date().toISOString();
    const employee = await client.from("employees").select("record_id").eq("nik", nik).limit(1).maybeSingle();
    if (employee.error) throw employee.error;
    if (employee.data) return { duplicate: true, applicantPoolId: null, duplicateCheckResult: { nik, foundIn: "employees", checkedAt } };

    const active = await client.from("online_registrations").select("record_id").eq("nik", nik)
      .in("registration_status", ["Pending", "pending", "Approved", "approved"]).is("archived_at", null).limit(1).maybeSingle();
    if (active.error) throw active.error;
    if (active.data) return { duplicate: true, applicantPoolId: null, duplicateCheckResult: { nik, foundIn: "online_registrations", checkedAt } };

    const pool = await client.from("online_registrations").select("record_id").eq("nik", nik)
      .in("registration_status", ["applicant_pool", "Applicant Pool"]).is("archived_at", null).limit(1).maybeSingle();
    if (pool.error) throw pool.error;
    return { duplicate: false, applicantPoolId: pool.data?.record_id ?? null, duplicateCheckResult: { nik, foundIn: "none", checkedAt } };
  });
}

export async function generateNewHiringLink(applicantId: string): Promise<{ token: string; expiry: string }> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const token = crypto.randomUUID();
    const days = Math.min(30, Math.max(1, Number(process.env.NEW_HIRING_LINK_EXPIRY_DAYS || 7)));
    const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const existing = await client.from("online_registrations").select("record_id").eq("record_id", applicantId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new RecordNotFoundError("Online Registration", applicantId);
    const revoke = await client.from("online_registrations").update({ new_hiring_link_status: "revoked", updated_at: new Date().toISOString() })
      .eq("record_id", applicantId).eq("new_hiring_link_status", "active");
    if (revoke.error) throw revoke.error;
    const updated = await client.from("online_registrations").update({ new_hiring_link_token: token, new_hiring_link_expiry: expiry, new_hiring_link_status: "active", new_hiring_link_created_at: new Date().toISOString(), new_hiring_link_accessed_at: null, new_hiring_link_used_at: null, new_hiring_link_revoked_at: null, access_channel: "new_hiring_link", updated_at: new Date().toISOString() }).eq("record_id", applicantId);
    if (updated.error) throw updated.error;
    return { token, expiry };
  });
}

export async function getNewHiringByToken(token: string): Promise<OnlineRegistration | null> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data, error } = await client.from("online_registrations").select("*").eq("new_hiring_link_token", token).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (String(data.new_hiring_link_status).toLowerCase() !== "active") return null;
    if (data.new_hiring_link_expiry && new Date(String(data.new_hiring_link_expiry)).getTime() <= Date.now()) {
      await client.from("online_registrations").update({ new_hiring_link_status: "expired", updated_at: new Date().toISOString() }).eq("record_id", data.record_id);
      return null;
    }
    await client.from("online_registrations").update({ new_hiring_link_accessed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("record_id", data.record_id).eq("new_hiring_link_status", "active");
    return rowToRegistration(data as SqlRow);
  });
}

export async function submitNewHiringApplication(token: string, input: EmployeeInput): Promise<OnlineRegistration> {
  const registration = await getNewHiringByToken(token);
  if (!registration) throw new RecordNotFoundError("New Hiring link", token);
  const nik = (input.nik ?? "").trim();
  if (!nik) throw new RegistrationIncompleteError(["NIK"]);

  const check = await verifyNewHiringNik(nik);
  const sameApplicantPool = check.applicantPoolId === registration.recordId;
  if (check.duplicate && !sameApplicantPool) throw new Error("NIK duplikat.");

  return supabaseGuarded(async () => {
    const patch: SqlRow = { registration_status: "Pending", access_channel: "new_hiring_link", new_hiring_link_status: "used", submitted_at: new Date().toISOString(), duplicate_check_result: check.duplicateCheckResult, updated_at: new Date().toISOString() };
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
      if (c.key !== "fingerCode" && input[c.key] !== undefined) patch[c.column] = input[c.key];
    }
    const { data, error } = await getSupabaseClient().from("online_registrations").update({ ...patch, new_hiring_link_used_at: new Date().toISOString() }).eq("record_id", registration.recordId).eq("new_hiring_link_token", token).eq("new_hiring_link_status", "active").select().single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

export async function revokeNewHiringLink(applicantIdOrToken: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const found = await client.from("online_registrations").select("record_id").or(`record_id.eq.${applicantIdOrToken},new_hiring_link_token.eq.${applicantIdOrToken}`).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new RecordNotFoundError("New Hiring link", applicantIdOrToken);
    const { data, error } = await client.from("online_registrations").update({ new_hiring_link_status: "revoked", new_hiring_link_revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("record_id", found.data.record_id).eq("new_hiring_link_status", "active").select("record_id").maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Active New Hiring link", applicantIdOrToken);
  });
}

function rowToPreviousJob(row: SqlRow): ApplicantPreviousJob {
  return { id: String(row.id), applicantId: String(row.applicant_id), companyName: String(row.company_name ?? ""), startYear: Number(row.start_year), endYear: row.end_year == null ? null : Number(row.end_year), lastPosition: String(row.last_position ?? ""), description: String(row.description ?? ""), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export async function getApplicantPreviousJobs(applicantId: string): Promise<ApplicantPreviousJob[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("applicant_previous_jobs").select("*").eq("applicant_id", applicantId).order("start_year", { ascending: false }).order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: SqlRow) => rowToPreviousJob(row));
  });
}

export async function createApplicantPreviousJob(applicantId: string, input: Omit<ApplicantPreviousJob, "id" | "applicantId" | "createdAt" | "updatedAt">): Promise<ApplicantPreviousJob> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("applicant_previous_jobs").insert({ applicant_id: applicantId, company_name: input.companyName, start_year: input.startYear, end_year: input.endYear ?? null, last_position: input.lastPosition, description: input.description }).select().single();
    if (error) throw error;
    return rowToPreviousJob(data as SqlRow);
  });
}

export async function updateApplicantPreviousJob(id: string, input: Omit<ApplicantPreviousJob, "id" | "applicantId" | "createdAt" | "updatedAt">): Promise<ApplicantPreviousJob> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("applicant_previous_jobs").update({ company_name: input.companyName, start_year: input.startYear, end_year: input.endYear ?? null, last_position: input.lastPosition, description: input.description, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return rowToPreviousJob(data as SqlRow);
  });
}

export async function deleteApplicantPreviousJob(id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const { error } = await getSupabaseClient().from("applicant_previous_jobs").delete().eq("id", id);
    if (error) throw error;
  });
}

/**
 * Creates a minimal "Sent" registration from just Name/HP Number/Position —
 * the basis of a shareable invite link. The row's `record_id` (a random
 * UUID, Postgres-generated) doubles as the public, unguessable token used in
 * /apply/[token].
 */
export async function createInviteRegistration(input: InviteRegistrationInput): Promise<OnlineRegistration> {
  return supabaseGuarded(async () => {
    const recordId = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from("online_registrations")
      .insert({
        record_id: recordId,
        name: input.name,
        hp_number: input.hpNumber,
        position: input.position,
        registration_status: "Sent",
        source_platform: "direct_link",
        submitted_at: "",
      })
      .select()
      .single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

/**
 * Called from the public /apply/[token] page. Re-validates server-side that
 * the invite is still open ("Sent", not yet submitted) and force-preserves
 * the HR-set name/HP number/position regardless of what the client payload
 * contains. On success, flips the status from "Sent" to "Pending".
 */
export async function submitPublicApplication(token: string, input: EmployeeInput): Promise<OnlineRegistration> {
  const registration = await getOnlineRegistrationById(token);
  if (!registration) throw new RecordNotFoundError("Online Registration", token);
  if (registration.registrationStatus.toLowerCase() !== "sent") {
    if (registration.submittedAt || registration.registrationStatus.toLowerCase() === "pending") {
      throw new RegistrationAlreadySubmittedError();
    }
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  return supabaseGuarded(async () => {
    const patch: SqlRow = {};
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
      if (c.key === "fingerCode") continue; // only generated once an employee is actually created
      if (c.key === "name" || c.key === "hpNumber" || c.key === "position") continue; // locked on the public form
      if (input[c.key] !== undefined) patch[c.column] = input[c.key];
    }
    patch.registration_status = "Pending";
    patch.submitted_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();

    const { data, error } = await getSupabaseClient()
      .from("online_registrations")
      .update(patch)
      .eq("record_id", token)
      .select()
      .single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

/** Permanently removes a registration row. Doesn't touch `employees` — an already-Approved registration's employee record is untouched. */
export async function deleteOnlineRegistration(recordId: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client
      .from("online_registrations")
      .select("id")
      .eq("record_id", recordId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("Online Registration", recordId);

    const { error } = await client.from("online_registrations").delete().eq("record_id", recordId);
    if (error) throw error;
  });
}

export async function updateOnlineRegistration(recordId: string, input: EmployeeInput): Promise<OnlineRegistration> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client
      .from("online_registrations")
      .select("id")
      .eq("record_id", recordId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("Online Registration", recordId);

    const patch: SqlRow = {};
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
      if (c.key === "fingerCode") continue; // only generated once an employee is actually created
      if (input[c.key] !== undefined) patch[c.column] = input[c.key];
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from("online_registrations")
      .update(patch)
      .eq("record_id", recordId)
      .select()
      .single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}

/**
 * Advances a registration from Applicant Pool to the New Hiring (document
 * review) stage — the recruitment pipeline is Applicant Pool -> New Hiring ->
 * Employee, and a candidate progresses through it by resubmitting the SAME
 * record (via /api/new-hiring/lookup) rather than filing a brand-new
 * application, which would otherwise leave duplicate entries scattered
 * across both pools. A no-op if the registration has already moved past
 * Applicant Pool (New Hiring, Approved, Rejected, ...) — never regresses a
 * record that's further along the pipeline.
 */
export async function promoteRegistrationToNewHiring(recordId: string): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client
      .from("online_registrations")
      .select("access_channel, registration_status")
      .eq("record_id", recordId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new RecordNotFoundError("Online Registration", recordId);

    const row = existing as SqlRow;
    const status = str(row.registration_status).toLowerCase();
    const channel = row.access_channel;
    if (channel !== "applicant_pool_qr" && status !== "applicant_pool") return;

    const { error } = await client
      .from("online_registrations")
      .update({ access_channel: "new_hiring_qr_nik", registration_status: "pending", updated_at: new Date().toISOString() })
      .eq("record_id", recordId);
    if (error) throw error;
  });
}

const REQUIRED_FOR_APPROVAL: { key: string; label: string }[] = [
  { key: "nik", label: "NIK" },
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "joinDate", label: "Join Date" },
];

/** Copies a Pending registration's fields into a brand-new `employees` row (same as creating an employee), then marks it Approved — atomically, via the `approve_online_registration` Postgres function. */
export async function approveOnlineRegistration(recordId: string, approvedBy?: string): Promise<{ employeeRecordId: string }> {
  const registration = await getOnlineRegistrationById(recordId);
  if (!registration) throw new RecordNotFoundError("Online Registration", recordId);
  if (registration.registrationStatus.toLowerCase() === "approved" && registration.migratedEmployeeRecordId) {
    return { employeeRecordId: registration.migratedEmployeeRecordId };
  }
  if (registration.registrationStatus.toLowerCase() !== "pending") {
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  const missing = REQUIRED_FOR_APPROVAL.filter((f) => !registration[f.key]?.trim()).map((f) => f.label);
  if (missing.length > 0) throw new RegistrationIncompleteError(missing);

  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existingCodes, error: codesError } = await client.from("employees").select("finger_code");
    if (codesError) throw codesError;
    const fingerCode = generateFingerCode(
      registration.joinDate,
      (existingCodes as { finger_code: string }[]).map((r) => r.finger_code),
    );

    const employeeFields: SqlRow = {};
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) {
      employeeFields[c.column] = c.key === "fingerCode" ? fingerCode : registration[c.key] ?? "";
    }

    const { data, error } = await client.rpc("approve_online_registration", {
      p_record_id: recordId,
      p_employee_fields: employeeFields,
      p_approved_by: approvedBy ?? null,
    });
    if (error) throw error;

    const employeeRecordId = String(data);

    // Mirrors EmployeeForm.tsx's syncFirstContractPeriod (the "New Employee"
    // admin form's auto-suggested first contract period) — that logic only
    // runs client-side on `isInternalAdminForm && mode === "create"`, which
    // this approval path never is, so without this an approved candidate
    // would start with zero contract history instead of an auto-filled
    // Probation/Contract 1 row like a manually-added employee gets.
    const statusNorm = registration.contractStatus.trim().toLowerCase();
    if (statusNorm === "probation" || statusNorm === "contract") {
      const contractType = statusNorm === "probation" ? "Probation" : "Contract 1";
      const contractEnd = statusNorm === "probation" ? calculateProbationEndDate(registration.joinDate) : null;
      const { error: contractError } = await client.from("contract_history").insert({
        employee_id: employeeRecordId,
        contract_type: contractType,
        contract_start: registration.joinDate,
        contract_end: contractEnd,
        status: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (contractError) throw contractError;
    }

    await createActivityLog(approvedBy ?? "System", `Approved applicant ${recordId} and migrated to employee ${employeeRecordId}`);
    return { employeeRecordId };
  });
}

export async function rejectOnlineRegistration(recordId: string): Promise<OnlineRegistration> {
  const registration = await getOnlineRegistrationById(recordId);
  if (!registration) throw new RecordNotFoundError("Online Registration", recordId);
  const status = registration.registrationStatus.toLowerCase();
  // "pending" (New Hiring) and "applicant_pool" are both rejectable — a
  // candidate can be turned down at either stage, not only after they've
  // advanced to New Hiring.
  if (status !== "pending" && status !== "applicant_pool") {
    throw new RegistrationAlreadyDecidedError(registration.registrationStatus);
  }

  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("online_registrations")
      .update({ registration_status: "Rejected", updated_at: new Date().toISOString() })
      .eq("record_id", recordId)
      .select()
      .single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
  });
}
