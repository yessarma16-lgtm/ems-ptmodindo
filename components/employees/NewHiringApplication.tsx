"use client";

import { useState } from "react";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import type { EmployeeFormMasterData } from "@/lib/master-data-options";

// NIK here means the company-assigned Employee ID (see "NIK (EMPLOYEE ID)" on
// the admin form) — a candidate never has one before being hired, so it's
// hidden from this self-service form. It's still optional in publicApplySchema
// (see PUBLIC_APPLY_OPTIONAL_OVERRIDES), so submitting without it is fine —
// HR fills it in later, same as the other excluded internal-only fields below.
// POSITION is superseded here by POSITION APPLIED (sourced from Vacant
// Position master data) — same treatment as the Applicant Pool walk-in form.
const EXCLUDED = ["nik", "fingerCode", "category", "department", "level", "skill", "type", "shed", "joinDate", "status", "exitDate", "reason", "masaKerja", "contractStatus", "permanenDate", "contractCriteria", "bpjsKtk", "bpjsKes", "sn", "mutasiI", "mutasiII", "detailDisabilitas", "interviewEvaluation", "position"];

export function NewHiringApplication({ token, masterData, masterDataError, initialNewForm = false }: { token: string; masterData: EmployeeFormMasterData | null; masterDataError: string | null; initialNewForm?: boolean }) {
  const [identifier, setIdentifier] = useState("");
  const [registration, setRegistration] = useState<Record<string, string> | null>(null);
  const [newForm, setNewForm] = useState(initialNewForm);
  const [error, setError] = useState("");

  async function findApplicant(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/new-hiring/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Applicant tidak ditemukan."); return; }
    setRegistration(data.registration);
  }

  if (newForm) return <><button type="button" className="mb-6 h-10 rounded-lg border border-input bg-card px-4 text-sm font-medium hover:bg-muted" onClick={() => setNewForm(false)}>Kembali</button><EmployeeForm mode="create" masterData={masterData} masterDataError={masterDataError} submitUrl={`/api/apply/new-hiring/${token}`} redirectTo="/apply/new-hiring/thanks" successMessage="Lamaran berhasil dikirim. Terima kasih!" submitLabel="Kirim Lamaran" language="id" excludeFields={EXCLUDED} sectionOrder={["Personal Information", "Employment Information", "Address & Contact", "Family Information", "Bank Information", "BPJS Information", "Tax Information", "Other Information"]} /></>;
  if (registration) return <EmployeeForm mode="edit" recordId={registration.recordId} initialValues={registration} masterData={masterData} masterDataError={masterDataError} submitUrl={`/api/new-hiring/lookup?record_id=${encodeURIComponent(registration.recordId)}`} redirectTo="/apply/new-hiring/thanks" successMessage="Lamaran berhasil diperbarui dan dilanjutkan ke tahap peninjauan berikutnya!" submitLabel="Kirim Ulang" language="id" lockedFields={["name", "positionApplied"]} excludeFields={EXCLUDED} sectionOrder={["Personal Information", "Employment Information", "Address & Contact", "Family Information", "Bank Information", "BPJS Information", "Tax Information", "Other Information"]} />;
  return <form onSubmit={findApplicant} className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm"><label className="block text-sm font-medium">Masuk dengan Nomor KTP / Nomor Kandidat / ID Lamaran<input className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></label>{error && <p className="text-sm text-destructive">{error}</p>}<button className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground">Masuk</button><a href={`/apply/new-hiring/${token}?new=1`} className="block text-center text-sm font-medium text-primary hover:underline">Formulir Baru</a></form>;
}
