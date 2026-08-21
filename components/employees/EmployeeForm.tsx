"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Save, Trash2 } from "lucide-react";

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
import { calculateProbationEndDate } from "@/lib/contract-dates";
import { formatDateDMY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { ContractHistoryEditor, type ContractPeriodRow } from "@/components/employees/ContractHistoryEditor";
import type { ContractHistoryEntry } from "@/lib/database/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
  lockedFields,
  excludeFields,
  sectionOrder = EMPLOYEE_SECTIONS,
  deleteConfig,
}: EmployeeFormProps) {
  const router = useRouter();
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

  const [contractEntries, setContractEntries] = useState<ContractPeriodRow[]>([]);
  const [originalContractIds, setOriginalContractIds] = useState<string[]>([]);

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

  function computeNextContractLabel(entries: ContractPeriodRow[]): string {
    const n = entries.filter((e) => e.contractType !== "Probation").length + 1;
    return `Contract ${n}`;
  }

  function handleAddContractPeriod() {
    setContractEntries((prev) => [
      ...prev,
      { key: crypto.randomUUID(), contractType: computeNextContractLabel(prev), startDate: "", endDate: "" },
    ]);
  }

  function handleContractFieldChange(key: string, field: "startDate" | "endDate", value: string) {
    setContractEntries((prev) => prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)));
  }

  function handleRemoveContractPeriod(key: string) {
    setContractEntries((prev) => prev.filter((e) => e.key !== key));
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
   * The FIRST contract period always mirrors CONTRACT STATUS: "Probation" ->
   * a "Probation" row with an auto-computed End Date; "Contract" -> a
   * "Contract 1" row with a blank, freely-picked End Date. Any other status
   * (Permanent, etc.) leaves periods alone — nothing auto-created. Re-run on
   * every JOIN DATE or CONTRACT STATUS change so switching either one keeps
   * this first slot in sync; periods added afterward via "+" are untouched.
   */
  function syncFirstContractPeriod(rawJoinDate: string, nextStatus: string) {
    // Native date inputs can briefly emit a malformed intermediate value
    // while a segment is still being typed — treat anything that isn't a
    // genuinely complete date as "not entered yet" rather than writing it in.
    const nextJoinDate = /^(19|20)\d{2}-\d{2}-\d{2}$/.test(rawJoinDate) ? rawJoinDate : "";
    const statusNorm = nextStatus.trim().toLowerCase();
    setContractEntries((prev) => {
      const hasAutoFirst = prev.length > 0 && (prev[0].contractType === "Probation" || prev[0].contractType === "Contract 1");

      if (statusNorm === "probation") {
        const first: ContractPeriodRow = {
          key: hasAutoFirst ? prev[0].key : crypto.randomUUID(),
          contractType: "Probation",
          startDate: nextJoinDate,
          endDate: nextJoinDate ? calculateProbationEndDate(nextJoinDate) : "",
        };
        return [first, ...(hasAutoFirst ? prev.slice(1) : prev)];
      }

      if (statusNorm === "contract") {
        const first: ContractPeriodRow = {
          key: hasAutoFirst ? prev[0].key : crypto.randomUUID(),
          contractType: "Contract 1",
          startDate: nextJoinDate,
          endDate: hasAutoFirst && prev[0].contractType === "Contract 1" ? prev[0].endDate : "",
        };
        return [first, ...(hasAutoFirst ? prev.slice(1) : prev)];
      }

      // Any other status: keep an existing auto-managed first slot's Start
      // Date current, but don't fabricate one that was never chosen.
      if (hasAutoFirst) return [{ ...prev[0], startDate: nextJoinDate }, ...prev.slice(1)];
      return prev;
    });
  }

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    if (key === "joinDate" && isInternalAdminForm && mode === "create") {
      syncFirstContractPeriod(value, values.contractStatus);
    } else if (key === "contractStatus" && isInternalAdminForm && mode === "create") {
      syncFirstContractPeriod(values.joinDate, value);
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

    const parsed = (isInternalAdminForm ? employeeSchema : publicApplySchema).safeParse(values);
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

    startTransition(async () => {
      try {
        const url = submitUrl ?? (mode === "create" ? "/api/employees" : `/api/employees/${recordId}`);
        const method = mode === "create" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
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
        }

        toast.success(
          successMessage ?? (mode === "create" ? "Employee created successfully." : "Employee updated successfully."),
        );

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
      } catch {
        toast.error("Unable to connect to Employee Database.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
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
                      options={locked ? [] : getOptionsForField(field, masterData)}
                      onChange={(v) => setField(field.key, v)}
                      mode={mode}
                    />
                  );
                })}
                {section === "Contract Information" && isInternalAdminForm && (
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

      {!readOnly && (
        <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-4 backdrop-blur">
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
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save Employee
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
}: {
  field: EmployeeField;
  value: string;
  error?: string;
  disabled?: boolean;
  options: SelectOption[];
  onChange: (value: string) => void;
  mode: EmployeeFormMode;
}) {
  const id = `field-${field.key}`;
  const labelNode = (
    <Label htmlFor={id} className="mb-1.5 block">
      {field.label}
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
        <Select value={value || undefined} onValueChange={onChange} disabled={isEmpty && !hasUnknownValue}>
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
