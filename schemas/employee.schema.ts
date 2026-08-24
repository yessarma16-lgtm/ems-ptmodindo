import { z } from "zod";
import { ALL_EMPLOYEE_FORM_FIELDS } from "@/config/employee-fields";

/**
 * Fields normally required (NIK, DEPARTMENT, JOIN DATE) that the public
 * apply/walk-in self-registration forms don't collect — those forms hide
 * Employment Information and NIK entirely (see PUBLIC_APPLY_EXCLUDED_FIELDS
 * in config/employee-fields.ts), since a candidate doesn't know their
 * assigned department or start date yet. HR fills all of these in later when
 * reviewing the registration; `approveOnlineRegistration` (see
 * lib/database/sqlite-online-registrations.ts / postgres-online-registrations.ts)
 * already independently requires them again before a registration can be
 * approved into a real employee record, so nothing slips through blank.
 *
 * POSITION is included here too — it's now hidden specifically on the
 * Applicant Pool walk-in form (see the merged excludeFields in
 * app/apply/walkin/[token]/page.tsx), superseded there by POSITION APPLIED
 * (sourced from the Vacant Position master data). It stays visible and
 * effectively required on New Hiring / the invite-link flow, which don't
 * exclude it — this override only relaxes the schema-level requirement so
 * the walk-in submission isn't blocked by a field it never shows.
 *
 * POSITION APPLIED is also here for the mirror-image reason: it's required
 * ON the Applicant Pool walk-in form, but excluded (hidden) on New Hiring and
 * the invite-link flow — since a single schema is shared by all public
 * forms, it can't be "required" only where shown, so it's relaxed here and
 * enforced instead as a targeted client-side check in EmployeeForm.tsx
 * (only when the field isn't in `excludeFields` — i.e. walk-in only).
 */
const PUBLIC_APPLY_OPTIONAL_OVERRIDES = new Set(["nik", "department", "joinDate", "position", "positionApplied"]);

/**
 * Zod schema built dynamically from `config/employee-fields.ts`, the single
 * source of truth for the Employee Master model. Required fields (NIK, NAME,
 * DEPARTMENT, POSITION, JOIN DATE) are enforced here; every other field
 * (including the extra fields appended after the 55 db_mod.xlsx fields —
 * Blood Type, Email, Branch) is optional text.
 *
 * `optionalOverrides` downgrades specific normally-required fields to
 * optional — used for `publicApplySchema` below.
 */
function buildEmployeeSchema(optionalOverrides: Set<string>) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of ALL_EMPLOYEE_FORM_FIELDS) {
    if (field.readOnly) {
      // Auto-calculated fields (SN, AGE, MASA KERJA) are never submitted by the user.
      shape[field.key] = z.string().optional();
      continue;
    }

    if (field.key === "fingerCode") {
      // Required only on the internal Add Employee admin form — enforced there
      // (client) and in the POST /api/employees route (server), not here,
      // because this schema is also used by the public apply/walk-in
      // self-registration forms, which never show or collect FINGER CODE.
      shape[field.key] = z.string().trim().optional().or(z.literal(""));
      continue;
    }

    if (field.key === "name") {
      // Always saved in ALL CAPS regardless of entry path (Add/Edit Employee
      // form, Excel import, public apply link, walk-in QR) — this is the one
      // validation point every path funnels through, so the transform applies
      // uniformly without touching each entry point separately.
      shape[field.key] = z
        .string({ required_error: `${field.label} wajib diisi` })
        .trim()
        .min(1, `${field.label} wajib diisi`)
        .transform((v) => v.toUpperCase());
      continue;
    }

    if (field.key === "ktpNo" && optionalOverrides.has("ktpNo")) {
      shape[field.key] = z.string({ required_error: `${field.label} wajib diisi` }).trim().min(1, `${field.label} wajib diisi`);
      continue;
    }

    if (field.key === "email") {
      shape[field.key] = z
        .string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((v) => !v || z.string().email().safeParse(v).success, {
          message: "EMAIL must be a valid email address",
        });
      continue;
    }

    if (field.required && !optionalOverrides.has(field.key)) {
      shape[field.key] = z
        .string({ required_error: `${field.label} wajib diisi` })
        .trim()
        .min(1, `${field.label} wajib diisi`);
    } else {
      shape[field.key] = z
        .string()
        .trim()
        .optional()
        .or(z.literal(""));
    }
  }

  return z.object(shape);
}

export const employeeSchema = buildEmployeeSchema(new Set());

/** Used by /api/apply/[token] and /api/apply/walkin/[token] — see PUBLIC_APPLY_OPTIONAL_OVERRIDES above. */
export const publicApplySchema = buildEmployeeSchema(PUBLIC_APPLY_OPTIONAL_OVERRIDES);

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
