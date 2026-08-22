import "server-only";

import * as postgresStore from "@/lib/database/postgres-online-registrations";
import type { EmployeeInput } from "@/lib/database/types";
import type { InviteRegistrationInput } from "@/lib/database/postgres-online-registrations";

export type { OnlineRegistration, InviteRegistrationInput } from "@/lib/database/postgres-online-registrations";
export {
  RegistrationIncompleteError,
  RegistrationAlreadyDecidedError,
  RegistrationAlreadySubmittedError,
} from "@/lib/database/online-registration-errors";

/**
 * Online Register — Recruitment candidate drafts, shaped like `employees`.
 * Available on all three providers: SQLite (dev) reads/writes
 * data/employee.db, Google Sheets (being migrated away from) reads/writes
 * the `Online_Registrations` sheet, Postgres (production, once migrated)
 * reads/writes the `online_registrations` table via Supabase.
 */

const store = () => postgresStore;

export async function getOnlineRegistrations() {
  return store().getOnlineRegistrations();
}

export async function getOnlineRegistrationById(recordId: string) {
  return store().getOnlineRegistrationById(recordId);
}

export async function createOnlineRegistration(input: EmployeeInput) {
  return store().createOnlineRegistration(input);
}

/** Used by the fixed walk-in QR code page — creates and submits a registration in one step. */
export async function createWalkInApplication(input: EmployeeInput) {
  return store().createWalkInApplication(input);
}

export async function createInviteRegistration(input: InviteRegistrationInput) {
  return store().createInviteRegistration(input);
}

/** Used by the public /apply/[token] page. */
export async function submitPublicApplication(token: string, input: EmployeeInput) {
  return store().submitPublicApplication(token, input);
}

export async function updateOnlineRegistration(recordId: string, input: EmployeeInput) {
  return store().updateOnlineRegistration(recordId, input);
}

export async function deleteOnlineRegistration(recordId: string) {
  return store().deleteOnlineRegistration(recordId);
}

export async function approveOnlineRegistration(recordId: string) {
  return store().approveOnlineRegistration(recordId);
}

export async function rejectOnlineRegistration(recordId: string) {
  return store().rejectOnlineRegistration(recordId);
}
