"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ClipboardCheck, Loader2, Save, Trash2, Plus } from "lucide-react";

import {
  ALL_EMPLOYEE_FORM_FIELDS,
  EMPLOYEE_SECTIONS,
  getFieldsBySection,
  type EmployeeField,
  type EmployeeSection,
} from "@/config/employee-fields";
import { getOptionsForField, type EmployeeFormMasterData, type SelectOption } from "@/lib/master-data-options";
import { employeeSchema, publicApplySchema } from "@/schemas/employee.schema";
import { calculateAge, calculateMasaKerja } from "@/lib/calculations";
import { calculateProbationEndDate, calculateContractPeriodDates } from "@/lib/contract-dates";
import { formatDateDMY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { ContractHistoryEditor, type ContractPeriodRow } from "@/components/employees/ContractHistoryEditor";
import type { ContractHistoryEntry, ContractCriteriaItem } from "@/lib/database/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type EmployeeFormMode = "create" | "edit" | "view";

/** A row in the Work Experience section, backed by `applicant_previous_jobs`. `key` is the real DB id once persisted, otherwise a client-generated temp id. */
interface WorkExperienceRow {
  key: string;
  company: string;
  position: string;
  startYear: string;
  endYear: string;
  experience: string;
}

interface EmployeeFormProps {
  mode: EmployeeFormMode;
  recordId?: string;
  initialValues?: Record<string, string>;
  /** Dropdown data read from Google Sheets (Departments/Positions/.../Lookup). Not needed in "view" mode. */
  masterData?: EmployeeFormMasterData | null;
  /** Safe, non-sensitive message if master data failed to load. */
  masterDataError?: string | null;
  /** Overrides the default /api/employees[...] endpoint — used to save this same form against a different record type (e.g. an Online Register draft). */
  submitUrl?: string;
  /** Overrides the default post-save redirect. */
  redirectTo?: string;
  /** Overrides the default "Employee created/updated" toast text. */
  successMessage?: string;
  /** Overrides the default "Save Employee" submit button text. */
  submitLabel?: string;
  /** Skips the post-save redirect entirely — stays on this same page (just refreshes the data) instead of navigating away. Ignores `redirectTo` when set. */
  stayOnPage?: boolean;
  /**
   * Shows an "HR Review" button next to Save (Recruitment edit page only) —
   * saves whatever has been filled in so far without enforcing mandatory
   * fields, for HR reviewing a registration mid-process. The server route
   * must separately honor the `x-hr-review` header this sends (see
   * PUT /api/online-register/[recordId]) — Approve/Promote still requires
   * the full mandatory set regardless, this only relaxes the Save step.
   */
  hrReview?: boolean;
  /**
   * Shows the Contract Information period editor (with the same
   * Probation/Contract auto-date-calc preview as the "New Employee" form)
   * even though this isn't the internal admin form — e.g. the recruitment
   * review page, where HR wants to see the computed Probation end date while
   * deciding, before the candidate is actually approved into a real Employee
   * record. Defaults to whatever `isInternalAdminForm` already is.
   */
  showContractPeriods?: boolean;
  /** Active Settings > Master Data > Contract Criteria entries — drives auto-filling CONTRACT CLOSE-FIRST/SECOND/... from JOIN DATE + CONTRACT CRITERIA. Only needed where contract periods auto-sync (see contractSyncAllowed below); omit elsewhere. */
  contractCriteria?: ContractCriteriaItem[];
  /** Field keys that render read-only regardless of `mode` — e.g. Name/HP Number/Position locked on the public /apply form. */
  lockedFields?: string[];
  /** Field keys omitted from rendering entirely — e.g. FINGER CODE on the public apply/walk-in forms, which applicants never see or fill in. */
  excludeFields?: string[];
  /** Overrides which sections render and in what order — defaults to EMPLOYEE_SECTIONS (the admin form's canonical order). */
  sectionOrder?: readonly EmployeeSection[];
  /** Shows a Delete button next to Cancel (edit mode only) — permanently removes the record at this URL, after a confirmation dialog. */
  deleteConfig?: {
    url: string;
    redirectTo: string;
    /** Shown in the confirmation dialog, e.g. the employee's name. */
    itemLabel?: string;
  };
}

/**
 * `crypto.randomUUID()` only exists in a secure context (HTTPS or
 * `localhost`) — the walk-in/new-hiring QR links are opened over plain HTTP
 * on a LAN IP (that's the whole point, so a phone on-site can reach them),
 * which is NOT a secure context, so the real API is simply absent there.
 * Only used for client-side-only temp keys (never sent to the server), so a
 * non-cryptographic fallback is fine.
 */
function randomClientKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildInitialState(initialValues?: Record<string, string>) {
  const state: Record<string, string> = {};
  for (const field of ALL_EMPLOYEE_FORM_FIELDS) {
    state[field.key] = initialValues?.[field.key] ?? "";
  }
  return state;
}

export function EmployeeForm({
  mode,
  recordId,
  initialValues,
  masterData = null,
  masterDataError = null,
  submitUrl,
  redirectTo,
  successMessage,
  submitLabel = "Save Employee",
  lockedFields,
  excludeFields,
  sectionOrder = EMPLOYEE_SECTIONS,
  deleteConfig,
  showContractPeriods,
  contractCriteria = [],
  stayOnPage = false,
  hrReview = false,
}: EmployeeFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildInitialState(initialValues),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const readOnly = mode === "view";
  // Contract history (probation/contract periods) is an internal HR concern —
  // never shown on the public apply/walk-in forms, which always pass their
  // own `submitUrl`.
  const isInternalAdminForm = !submitUrl;
  const showContractPeriodsResolved = showContractPeriods ?? isInternalAdminForm;

  const [contractEntries, setContractEntries] = useState<ContractPeriodRow[]>([]);
  const [originalContractIds, setOriginalContractIds] = useState<string[]>([]);
  /** How many LEADING contractEntries rows are auto-managed by syncAutoContractPeriods — anything after that index was added manually via "+" and must never be touched by a re-sync. */
  const autoManagedCountRef = useRef(0);
  const [workExperiences, setWorkExperiences] = useState<WorkExperienceRow[]>([]);
  const [originalWorkExperienceIds, setOriginalWorkExperienceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isInternalAdminForm || mode === "create" || !recordId) return;
    let cancelled = false;
    fetch(`/api/employees/${recordId}/contracts`)
      .then((r) => r.json())
      .then((data: { entries?: ContractHistoryEntry[] }) => {
        if (cancelled) return;
        const rows: ContractPeriodRow[] = (data.entries ?? []).map((e) => ({
          key: e.id,
          contractType: e.contractType,
          startDate: e.startDate,
          endDate: e.endDate,
        }));
        setContractEntries(rows);
        setOriginalContractIds(rows.map((r) => r.key));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isInternalAdminForm, mode, recordId]);

  // Work Experience is backed by `applicant_previous_jobs`, keyed off the
  // online-registration's recordId — only applies to the public apply/edit
  // flows and the admin's registration edit page (all pass `submitUrl`), not
  // the internal Employees form (an Employee record isn't an applicant).
  useEffect(() => {
    if (isInternalAdminForm || mode === "create" || !recordId) return;
    let cancelled = false;
    fetch(`/api/new-hiring/previous-jobs?applicant_id=${encodeURIComponent(recordId)}`)
      .then((r) => r.json())
      .then((data: { jobs?: { id: string; companyName: string; lastPosition: string; startYear: number; endYear: number | null; description: string }[] }) => {
        if (cancelled) return;
        const rows: WorkExperienceRow[] = (data.jobs ?? []).map((j) => ({
          key: j.id,
          company: j.companyName,
          position: j.lastPosition,
          startYear: String(j.startYear),
          endYear: j.endYear ? String(j.endYear) : "",
          experience: j.description,
        }));
        setWorkExperiences(rows);
        setOriginalWorkExperienceIds(rows.map((r) => r.key));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isInternalAdminForm, mode, recordId]);

  function computeNextContractLabel(entries: ContractPeriodRow[]): string {
    const n = entries.filter((e) => e.contractType !== "Probation").length + 1;
    return `Contract ${n}`;
  }

  function handleAddContractPeriod() {
    setContractEntries((prev) => [
      ...prev,
      { key: randomClientKey(), contractType: computeNextContractLabel(prev), startDate: "", endDate: "" },
    ]);
  }

  function handleContractFieldChange(key: string, field: "startDate" | "endDate", value: string) {
    setContractEntries((prev) => prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)));
  }

  function handleRemoveContractPeriod(key: string) {
    setContractEntries((prev) => prev.filter((e) => e.key !== key));
  }

  function handleAddWorkExperience() {
    setWorkExperiences((prev) => [
      ...prev,
      { key: randomClientKey(), company: "", position: "", startYear: "", endYear: "", experience: "" },
    ]);
  }

  function handleRemoveWorkExperience(key: string) {
    setWorkExperiences((prev) => prev.filter((e) => e.key !== key));
  }

  /** Diffs workExperiences against what was originally loaded and syncs the difference — create/update/delete, run once after the registration itself is saved. Rows missing a company or start year are skipped (incomplete/blank rows the applicant never filled in). */
  async function reconcileWorkExperience(applicantId: string) {
    const currentKeys = new Set(workExperiences.map((e) => e.key));
    const removedIds = originalWorkExperienceIds.filter((id) => !currentKeys.has(id));

    await Promise.all([
      ...workExperiences
        .filter((e) => e.company.trim() && e.startYear.trim())
        .map((e) => {
          const payload = {
            applicant_id: applicantId,
            companyName: e.company,
            lastPosition: e.position,
            startYear: Number(e.startYear),
            endYear: e.endYear ? Number(e.endYear) : null,
            description: e.experience,
          };
          const isExisting = originalWorkExperienceIds.includes(e.key);
          return isExisting
            ? fetch(`/api/new-hiring/previous-jobs/${e.key}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              })
            : fetch("/api/new-hiring/previous-jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
        }),
      ...removedIds.map((id) => fetch(`/api/new-hiring/previous-jobs/${id}`, { method: "DELETE" })),
    ]);
  }

  /** Diffs contractEntries against what was originally loaded and syncs the difference — create/update/delete, run once after the employee record itself is saved. */
  async function reconcileContractHistory(employeeId: string) {
    const currentKeys = new Set(contractEntries.map((e) => e.key));
    const removedIds = originalContractIds.filter((id) => !currentKeys.has(id));

    await Promise.all([
      ...contractEntries.map((e) => {
        const payload = { contractType: e.contractType, startDate: e.startDate, endDate: e.endDate };
        const isExisting = originalContractIds.includes(e.key);
        return isExisting
          ? fetch(`/api/employees/${employeeId}/contracts/${e.key}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : fetch(`/api/employees/${employeeId}/contracts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      }),
      ...removedIds.map((id) => fetch(`/api/employees/${employeeId}/contracts/${id}`, { method: "DELETE" })),
    ]);
  }

  async function handleDelete() {
    if (!deleteConfig) return;
    setDeleting(true);
    try {
      const res = await fetch(deleteConfig.url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete.");
        return;
      }
      toast.success("Deleted successfully.");
      router.push(deleteConfig.redirectTo);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const age = calculateAge(values.birthDate);
  const masaKerja = calculateMasaKerja(values.joinDate);

  /**
   * Auto-manages the LEADING contractEntries rows from JOIN DATE + CONTRACT
   * STATUS + CONTRACT CRITERIA — re-run whenever any of the three changes so
   * they stay in sync; rows added afterward via "+" (tracked past
   * `autoManagedCountRef.current`) are never touched by a re-sync.
   *
   * With a matching, configured CONTRACT CRITERIA (Settings > Master Data >
   * Contract Criteria): every one of its periods is computed sequentially
   * from JOIN DATE (see calculateContractPeriodDates) and replaces the whole
   * auto-managed block — e.g. "3 + 2" fills CONTRACT CLOSE-FIRST (Join Date +
   * 3y) and CONTRACT CLOSE-SECOND (+2y more). Without one (no CONTRACT
   * CRITERIA selected yet, or it has no periods configured), falls back to
   * the original single-period defaults: Probation -> Join Date + 3 months
   * (auto End Date); Contract -> a "Contract 1" row with a blank,
   * freely-picked End Date; any other status leaves periods alone.
   */
  function syncAutoContractPeriods(rawJoinDate: string, nextStatus: string, criteriaName: string) {
    // Native date inputs can briefly emit a malformed intermediate value
    // while a segment is still being typed — treat anything that isn't a
    // genuinely complete date as "not entered yet" rather than writing it in.
    const nextJoinDate = /^(19|20)\d{2}-\d{2}-\d{2}$/.test(rawJoinDate) ? rawJoinDate : "";
    const statusNorm = nextStatus.trim().toLowerCase();
    const criteria = contractCriteria.find((c) => c.name === criteriaName && c.periods.length > 0);

    setContractEntries((prev) => {
      const autoCount = autoManagedCountRef.current;
      const manual = prev.slice(autoCount);

      if (criteria && nextJoinDate) {
        const computed = calculateContractPeriodDates(nextJoinDate, criteria.periods);
        let contractNum = 0;
        const generated: ContractPeriodRow[] = computed.map((period, idx) => ({
          key: idx < autoCount ? prev[idx].key : randomClientKey(),
          contractType: idx === 0 && statusNorm === "probation" ? "Probation" : `Contract ${(contractNum += 1)}`,
          startDate: period.startDate,
          endDate: period.endDate,
        }));
        autoManagedCountRef.current = generated.length;
        return [...generated, ...manual];
      }

      const hasAutoFirst = autoCount > 0;

      if (statusNorm === "probation") {
        const first: ContractPeriodRow = {
          key: hasAutoFirst ? prev[0].key : randomClientKey(),
          contractType: "Probation",
          startDate: nextJoinDate,
          endDate: nextJoinDate ? calculateProbationEndDate(nextJoinDate) : "",
        };
        autoManagedCountRef.current = 1;
        return [first, ...manual];
      }

      if (statusNorm === "contract") {
        const first: ContractPeriodRow = {
          key: hasAutoFirst ? prev[0].key : randomClientKey(),
          contractType: "Contract 1",
          startDate: nextJoinDate,
          endDate: hasAutoFirst && prev[0].contractType === "Contract 1" ? prev[0].endDate : "",
        };
        autoManagedCountRef.current = 1;
        return [first, ...manual];
      }

      // Any other status: keep an existing auto-managed first slot's Start
      // Date current, but don't fabricate one that was never chosen.
      if (hasAutoFirst) {
        autoManagedCountRef.current = 1;
        return [{ ...prev[0], startDate: nextJoinDate }, ...prev.slice(1)];
      }
      autoManagedCountRef.current = 0;
      return prev;
    });
  }

  function setField(key: string, value: string) {
    // Switching CONTRACT STATUS can leave the currently-picked CONTRACT
    // CRITERIA no longer valid for it (each criteria only "applies to" one
    // status) — clear it rather than silently keep a mismatched selection.
    const criteriaStillValid =
      key !== "contractStatus" ||
      contractCriteria.some((c) => c.name === values.contractCriteria && c.appliesToStatus === value);
    const nextCriteria = criteriaStillValid ? values.contractCriteria : "";

    setValues((prev) => ({
      ...prev,
      [key]: value,
      ...(criteriaStillValid ? {} : { contractCriteria: "" }),
    }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    // Auto-fires on the internal admin form only while creating (never
    // silently overwrite an existing employee's real contract history just
    // because someone touched JOIN DATE/CONTRACT STATUS on an edit) — but
    // always on the recruitment review context (showContractPeriods), since
    // nothing has been persisted as real contract history yet there either
    // way; this is purely a live preview of what approval will create.
    const contractSyncAllowed = showContractPeriodsResolved && (!isInternalAdminForm || mode === "create");
    if (key === "joinDate" && contractSyncAllowed) {
      syncAutoContractPeriods(value, values.contractStatus, values.contractCriteria);
    } else if (key === "contractStatus" && contractSyncAllowed) {
      syncAutoContractPeriods(values.joinDate, value, nextCriteria);
    } else if (key === "contractCriteria" && contractSyncAllowed) {
      syncAutoContractPeriods(values.joinDate, values.contractStatus, value);
    }
  }

  function displayValue(field: EmployeeField): string {
    if (field.key === "age") return age !== null ? String(age) : "";
    if (field.key === "masaKerja") return masaKerja ?? "";
    return values[field.key] ?? "";
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly) return;
    submitForm(e.currentTarget, {});
  }

  /** HR Review button — bypasses the validation gate below entirely, saving whatever's filled in so far. See the `hrReview` prop doc for why. */
  function handleHrReviewClick() {
    if (readOnly || !formRef.current) return;
    submitForm(formRef.current, { bypass: true });
  }

  function submitForm(formElement: HTMLFormElement, opts: { bypass?: boolean }) {
    // Read the current DOM values as well as React state. This keeps mobile
    // browser input/autofill values from being lost when the form is saved.
    const submittedValues = { ...values };
    const formData = new FormData(formElement);
    for (const field of ALL_EMPLOYEE_FORM_FIELDS) {
      const value = formData.get(field.key);
      if (typeof value === "string") submittedValues[field.key] = value;
    }

    const parsed = (isInternalAdminForm ? employeeSchema : publicApplySchema).safeParse(submittedValues);
    const bodyData = parsed.success ? parsed.data : submittedValues;

    if (!opts.bypass) {
      const flat: Record<string, string> = {};
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        Object.entries(fieldErrors).forEach(([k, v]) => {
          if (v && v[0]) flat[k] = v[0];
        });
      }

      // FINGER CODE is only required on the internal Add Employee admin
      // form — the shared schema always treats it as optional so public
      // apply/walk-in submissions (which never show this field) aren't blocked.
      if (mode === "create" && !excludeFields?.includes("fingerCode") && !values.fingerCode?.trim()) {
        flat.fingerCode = "FINGER CODE wajib diisi";
      }

      // POSITION APPLIED is relaxed to optional in publicApplySchema (it's
      // hidden on New Hiring/invite-link, which would otherwise be blocked by
      // a field they never render) — so it's enforced here instead, only on
      // forms where it's actually shown (walk-in), same pattern as FINGER CODE above.
      if (!excludeFields?.includes("positionApplied") && !values.positionApplied?.trim()) {
        flat.positionApplied = "POSITION APPLIED wajib diisi";
      }

      if (!parsed.success || Object.keys(flat).length > 0) {
        setErrors(flat);
        toast.error("Please fix the highlighted fields before saving.");
        const firstErrorKey = Object.keys(flat)[0];
        if (firstErrorKey) {
          document
            .getElementById(`field-${firstErrorKey}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      if (isInternalAdminForm && contractEntries.some((e) => !e.startDate || !e.endDate)) {
        toast.error("Lengkapi Start Date dan End Date di setiap periode kontrak, atau hapus baris yang kosong.");
        return;
      }
    } else {
      setErrors({});
    }

    startTransition(async () => {
      try {
        const url = submitUrl ?? (mode === "create" ? "/api/employees" : `/api/employees/${recordId}`);
        const method = mode === "create" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...(opts.bypass ? { "x-hr-review": "1" } : {}) },
          body: JSON.stringify(bodyData),
        });
        const data = await res.json();

        if (!res.ok) {
          if (data.issues) {
            const flat: Record<string, string> = {};
            Object.entries(data.issues as Record<string, string[]>).forEach(([k, v]) => {
              if (v?.[0]) flat[k] = v[0];
            });
            setErrors(flat);
          }
          toast.error(data.error ?? "Failed to save employee.");
          return;
        }

        if (isInternalAdminForm) {
          const savedEmployeeId = mode === "create" ? data.employee?.recordId : recordId;
          if (savedEmployeeId) await reconcileContractHistory(savedEmployeeId);
        } else {
          const savedApplicantId = mode === "create" ? data.registration?.recordId : recordId;
          if (savedApplicantId) await reconcileWorkExperience(savedApplicantId);
        }

        toast.success(
          successMessage ?? (mode === "create" ? "Employee created successfully." : "Employee updated successfully."),
        );

        if (stayOnPage) {
          router.refresh();
        } else {
          let target = redirectTo ?? (mode === "create" ? "/employees" : `/employees/${recordId}`);
          // For a custom redirectTo (e.g. the walk-in Thank You page), carry the
          // newly-created record's id forward as a query param so that page can
          // look up its own submission details to display.
          const createdRecordId: string | undefined = data.employee?.recordId ?? data.registration?.recordId;
          if (redirectTo && createdRecordId) {
            target = `${target}${target.includes("?") ? "&" : "?"}rid=${createdRecordId}`;
          }
          router.push(target);
          router.refresh();
        }
      } catch {
        toast.error("Unable to connect to Employee Database.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      {!readOnly && masterDataError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="mt-0.5" />
          <div className="flex w-full items-center justify-between gap-4">
            <div>
              <AlertTitle>Unable to load master data.</AlertTitle>
              <AlertDescription>{masterDataError}</AlertDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      <div className="space-y-6">
        {sectionOrder.map((section) => {
          const fields = getFieldsBySection(section).filter((f) => !excludeFields?.includes(f.key));
          if (fields.length === 0) return null;
          return (
            <Card key={section}>
              <CardHeader>
                <CardTitle>{section}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((field) => {
                  const locked = readOnly || !!lockedFields?.includes(field.key);
                  return (
                    <FieldControl
                      key={field.key}
                      field={field}
                      value={displayValue(field)}
                      error={errors[field.key]}
                      disabled={locked}
                      options={
                        locked
                          ? []
                          : field.key === "contractCriteria"
                            ? contractCriteria
                                .filter((c) => !values.contractStatus || c.appliesToStatus === values.contractStatus)
                                .map((c) => ({ value: c.name, label: c.name }))
                            : getOptionsForField(field, masterData)
                      }
                      onChange={(v) => setField(field.key, v)}
                      mode={mode}
                    />
                  );
                })}
                {section === "Contract Information" && showContractPeriodsResolved && (
                  <ContractHistoryEditor
                    mode={mode}
                    entries={contractEntries}
                    onAdd={handleAddContractPeriod}
                    onChangeField={handleContractFieldChange}
                    onRemove={handleRemoveContractPeriod}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Work Experience</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {workExperiences.map((item) => (
            <div key={item.key} className="grid grid-cols-1 items-start gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Input placeholder="Company" value={item.company} readOnly={readOnly} onChange={(e) => setWorkExperiences((rows) => rows.map((row) => row.key === item.key ? { ...row, company: e.target.value } : row))} />
              <Input placeholder="Job Position" value={item.position} readOnly={readOnly} onChange={(e) => setWorkExperiences((rows) => rows.map((row) => row.key === item.key ? { ...row, position: e.target.value } : row))} />
              <Input type="number" placeholder="Start Year" aria-label="Start Year" value={item.startYear} readOnly={readOnly} onChange={(e) => setWorkExperiences((rows) => rows.map((row) => row.key === item.key ? { ...row, startYear: e.target.value } : row))} />
              <Input type="number" placeholder="End Year" aria-label="End Year (blank = present)" value={item.endYear} readOnly={readOnly} onChange={(e) => setWorkExperiences((rows) => rows.map((row) => row.key === item.key ? { ...row, endYear: e.target.value } : row))} />
              <Textarea placeholder="Work Experience" value={item.experience} readOnly={readOnly} onChange={(e) => setWorkExperiences((rows) => rows.map((row) => row.key === item.key ? { ...row, experience: e.target.value } : row))} />
              {!readOnly && (
                <Button type="button" variant="ghost" size="icon" title="Remove this entry" className="justify-self-start sm:justify-self-end" onClick={() => handleRemoveWorkExperience(item.key)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={handleAddWorkExperience}
            >
              <Plus className="size-4" />
              Add Work Experience
            </button>
          )}
          {readOnly && workExperiences.length === 0 && <p className="text-sm text-muted-foreground">No work experience recorded.</p>}
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          {deleteConfig && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isPending || deleting}
            >
              <Trash2 />
              Delete
            </Button>
          )}
          {hrReview && (
            <Button type="button" variant="secondary" title="Save without requiring the mandatory fields to be filled in" onClick={handleHrReviewClick} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
              HR Review
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {submitLabel}
          </Button>
        </div>
      )}

      {deleteConfig && (
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this employee?</DialogTitle>
              <DialogDescription>
                Yakin ingin menghapus{" "}
                <span className="font-medium text-foreground">{deleteConfig.itemLabel || "this employee"}</span>?
                Tindakan ini permanen dan tidak bisa dibatalkan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Yes, Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}

function FieldControl({
  field,
  value,
  error,
  disabled,
  options,
  onChange,
  mode,
  label,
}: {
  field: EmployeeField;
  value: string;
  error?: string;
  disabled?: boolean;
  options: SelectOption[];
  onChange: (value: string) => void;
  mode: EmployeeFormMode;
  label?: string;
}) {
  const id = `field-${field.key}`;
  const labelNode = (
    <Label htmlFor={id} className="mb-1.5 block">
      {label ?? field.label}
      {field.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  if (field.type === "auto") {
    // AGE and MASA KERJA specifically requested in black — the default
    // read-only/disabled styling (opacity-50, muted-foreground) made them
    // hard to read.
    const isAgeOrMasaKerja = field.key === "age" || field.key === "masaKerja";
    return (
      <div>
        {labelNode}
        <Input
          id={id}
          name={field.key}
          value={value}
          readOnly
          disabled
          tabIndex={-1}
          className={cn("bg-muted", isAgeOrMasaKerja && "text-black opacity-100 disabled:opacity-100")}
        />
      </div>
    );
  }

  // FINGER CODE is freely editable while creating a new employee, but locked
  // (read-only) once the record has been saved — it's never auto-generated.
  if (field.key === "fingerCode" && mode !== "create") {
    return (
      <div>
        {labelNode}
        <Input id={id} value={value} readOnly disabled tabIndex={-1} className="bg-muted" />
      </div>
    );
  }

  // Read-only "view" mode never needs the interactive <Select> (or its master
  // data) — showing the already-saved text is simpler and always correct,
  // even if master data hasn't loaded / a since-renamed option no longer exists.
  // `readOnly` (not `disabled`) so the field is still clickable and its text
  // selectable — just not editable.
  if (field.type === "select" && disabled) {
    return (
      <div>
        {labelNode}
        <Input id={id} value={value} readOnly className="bg-muted cursor-text" />
      </div>
    );
  }

  if (field.type === "select") {
    const isEmpty = options.length === 0;
    // A saved value that doesn't match any current Master Data option (e.g.
    // imported from Excel with different wording, or a since-renamed/removed
    // option) would otherwise make the Select render as if empty — the data
    // is still there, just not one of the known choices. Show it anyway as
    // an extra option instead of hiding it.
    const hasUnknownValue = value && !options.some((opt) => opt.value === value);
    const displayOptions = hasUnknownValue ? [{ value, label: `${value} (not in Master Data)` }, ...options] : options;
    return (
      <div>
        {labelNode}
        {/* A custom (Radix) dropdown instead of a native <select> — tapping an
            option applies it immediately and closes the list, instead of mobile
            browsers' native picker wheel that needs an extra "Done" tap to confirm. */}
        <Select name={field.key} value={value || undefined} onValueChange={onChange} disabled={isEmpty && !hasUnknownValue}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={isEmpty ? `No ${field.label.toLowerCase()} available` : "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {displayOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="sm:col-span-2 lg:col-span-3">
        {labelNode}
        <Textarea
          id={id}
          name={field.key}
          value={value}
          readOnly={disabled}
          className={disabled ? "bg-muted cursor-text" : undefined}
          onChange={disabled ? undefined : (e) => onChange(e.target.value)}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {labelNode}
      <Input
        id={id}
        name={field.key}
        type={disabled ? "text" : field.type === "date" ? "date" : "text"}
        value={disabled && field.type === "date" ? formatDateDMY(value) : value}
        readOnly={disabled}
        className={disabled ? "bg-muted cursor-text" : undefined}
        onChange={disabled ? undefined : (e) => onChange(e.target.value)}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
