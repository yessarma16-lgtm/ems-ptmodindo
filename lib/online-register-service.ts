import "server-only";

import * as postgresStore from "@/lib/database/postgres-online-registrations";
import type { EmployeeInput } from "@/lib/database/types";
import type { ApplicantPreviousJob } from "@/lib/database/types";
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

export async function createNewHiringQrApplication(input: EmployeeInput) {
  return store().createNewHiringQrApplication(input);
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

/** Advances a registration from Applicant Pool to New Hiring — see postgres-online-registrations.ts for the full rationale. No-op past Applicant Pool. */
export async function promoteRegistrationToNewHiring(recordId: string) {
  return store().promoteRegistrationToNewHiring(recordId);
}

export async function deleteOnlineRegistration(recordId: string) {
  return store().deleteOnlineRegistration(recordId);
}

export async function approveOnlineRegistration(recordId: string, approvedBy?: string) {
  return store().approveOnlineRegistration(recordId, approvedBy);
}

export async function rejectOnlineRegistration(recordId: string) {
  return store().rejectOnlineRegistration(recordId);
}

export async function verifyNewHiringNik(nik: string) {
  return store().verifyNewHiringNik(nik);
}

export async function generateNewHiringLink(applicantId: string) {
  return store().generateNewHiringLink(applicantId);
}

export async function getNewHiringByToken(token: string) {
  return store().getNewHiringByToken(token);
}

export async function submitNewHiringApplication(token: string, input: EmployeeInput) {
  return store().submitNewHiringApplication(token, input);
}

export async function revokeNewHiringLink(applicantId: string) { return store().revokeNewHiringLink(applicantId); }

type PreviousJobInput = Omit<ApplicantPreviousJob, "id" | "applicantId" | "createdAt" | "updatedAt">;
export async function getApplicantPreviousJobs(applicantId: string) { return store().getApplicantPreviousJobs(applicantId); }
export async function createApplicantPreviousJob(applicantId: string, input: PreviousJobInput) { return store().createApplicantPreviousJob(applicantId, input); }
export async function updateApplicantPreviousJob(id: string, input: PreviousJobInput) { return store().updateApplicantPreviousJob(id, input); }
export async function deleteApplicantPreviousJob(id: string) { return store().deleteApplicantPreviousJob(id); }
