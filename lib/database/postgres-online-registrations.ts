import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { EMPLOYEE_COLUMNS, WRITABLE_EMPLOYEE_COLUMNS } from "@/lib/database/sqlite-columns";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { generateFingerCode } from "@/lib/database/finger-code";
import { RecordNotFoundError } from "@/lib/database/errors";
import {
  RegistrationIncompleteError,
  RegistrationAlreadyDecidedError,
  RegistrationAlreadySubmittedError,
} from "@/lib/database/online-registration-errors";
import type { EmployeeInput } from "@/lib/database/types";
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
    const row: SqlRow = { registration_status: "Pending", source_platform: "walkin", submitted_at: now };
    for (const c of WRITABLE_EMPLOYEE_COLUMNS) row[c.column] = c.key === "fingerCode" ? "" : input[c.key] ?? "";

    const { data, error } = await getSupabaseClient().from("online_registrations").insert(row).select().single();
    if (error) throw error;
    return rowToRegistration(data as SqlRow);
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
    const { data, error } = await getSupabaseClient()
      .from("online_registrations")
      .insert({
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

const REQUIRED_FOR_APPROVAL: { key: string; label: string }[] = [
  { key: "nik", label: "NIK" },
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "joinDate", label: "Join Date" },
];

/** Copies a Pending registration's fields into a brand-new `employees` row (same as creating an employee), then marks it Approved — atomically, via the `approve_online_registration` Postgres function. */
export async function approveOnlineRegistration(recordId: string): Promise<{ employeeRecordId: string }> {
  const registration = await getOnlineRegistrationById(recordId);
  if (!registration) throw new RecordNotFoundError("Online Registration", recordId);
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
    });
    if (error) throw error;

    return { employeeRecordId: String(data) };
  });
}

export async function rejectOnlineRegistration(recordId: string): Promise<OnlineRegistration> {
  const registration = await getOnlineRegistrationById(recordId);
  if (!registration) throw new RecordNotFoundError("Online Registration", recordId);
  if (registration.registrationStatus.toLowerCase() !== "pending") {
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
