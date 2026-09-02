import type { Client } from "pg";

import { SIMPLE_MASTER_SHEETS, LOOKUP_TYPES } from "@/config/master-data-sheets";
import { SIMPLE_MASTER_SEED, LOOKUP_SEED } from "@/config/master-data-seed";
import { OT_DURATION_MULTIPLIER_SEED } from "@/config/ot-planning-multipliers";
import { EMPLOYEE_COLUMNS, WRITABLE_EMPLOYEE_COLUMNS } from "@/lib/database/sqlite-columns";
import { defaultModulePermissions } from "@/config/module-permissions";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";

/**
 * Postgres (Supabase) schema + seed — mirrors `lib/database/sqlite-init.ts`
 * table-for-table, translated to Postgres syntax (SERIAL/BIGSERIAL, UUID,
 * TIMESTAMPTZ, `ADD COLUMN IF NOT EXISTS`). Column lists for `employees` and
 * `online_registrations` are derived from the same `EMPLOYEE_COLUMNS` single
 * source of truth SQLite uses, so both providers' schemas stay in sync
 * automatically as `config/employee-fields.ts` changes.
 *
 * Every statement is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT
 * EXISTS` / a guarded INSERT — safe to run repeatedly from
 * `npm run db:init:postgres`. Never drops or clears a table.
 *
 * Runs over a raw `pg` connection (the Postgres wire protocol, using the
 * direct/session connection string) because Supabase's PostgREST HTTP API
 * (used everywhere else — see lib/supabase.ts) cannot execute DDL. This is
 * the ONLY place in the codebase that uses a raw Postgres connection, and
 * it's a one-time local/CI script, never part of a serverless request path.
 */

const SIMPLE_MASTER_TABLE_DDL = `
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  sort_order INTEGER NOT NULL DEFAULT 0
`;

function buildEmployeesTableSql(): string {
  const fieldColumns = EMPLOYEE_COLUMNS.map((c) => `  ${c.column} TEXT NOT NULL DEFAULT ''`).join(",\n");
  return `
    CREATE TABLE IF NOT EXISTS employees (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
${fieldColumns},
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}

async function ensureEmployeeColumnsExist(client: Client): Promise<void> {
  for (const c of EMPLOYEE_COLUMNS) {
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ${c.column} TEXT NOT NULL DEFAULT ''`);
  }
}

async function ensureLookupSeedsExist(client: Client): Promise<void> {
  const { rows: existingRows } = await client.query<{ type: string; code: string }>("SELECT type, code FROM lookup");
  const existing = new Set(existingRows.map((r) => `${r.type}::${r.code}`));
  const maxSortOrderByType = new Map<string, number>();

  for (const { type } of LOOKUP_TYPES) {
    for (const row of LOOKUP_SEED[type]) {
      if (existing.has(`${type}::${row.code}`)) continue;
      if (!maxSortOrderByType.has(type)) {
        const { rows } = await client.query<{ m: number }>(
          "SELECT COALESCE(MAX(sort_order), 0) as m FROM lookup WHERE type = $1",
          [type],
        );
        maxSortOrderByType.set(type, rows[0].m);
      }
      const nextSortOrder = (maxSortOrderByType.get(type) ?? 0) + 1;
      maxSortOrderByType.set(type, nextSortOrder);
      await client.query("INSERT INTO lookup (type, code, name, status, sort_order) VALUES ($1, $2, $3, 'Active', $4)", [
        type,
        row.code,
        row.name,
        nextSortOrder,
      ]);
    }
  }
}

/** Adds every `employees` column to `online_registrations` too (employee-shaped drafts) — same pattern as sqlite-init.ts's ensureOnlineRegistrationsEmployeeShaped. */
async function ensureOnlineRegistrationsEmployeeShaped(client: Client): Promise<void> {
  for (const c of EMPLOYEE_COLUMNS) {
    await client.query(
      `ALTER TABLE online_registrations ADD COLUMN IF NOT EXISTS ${c.column} TEXT NOT NULL DEFAULT ''`,
    );
  }
}

/** Applicant Pool/New Hiring additions. Additive and safe for existing databases. */
async function ensureApplicantPoolSchema(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE online_registrations
      ADD COLUMN IF NOT EXISTS candidate_number TEXT,
      ADD COLUMN IF NOT EXISTS access_channel TEXT,
      ADD COLUMN IF NOT EXISTS duplicate_check_result JSONB,
      ADD COLUMN IF NOT EXISTS ocr_source_document_id UUID,
      ADD COLUMN IF NOT EXISTS new_hiring_link_token UUID,
      ADD COLUMN IF NOT EXISTS new_hiring_link_expiry TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS new_hiring_link_status TEXT,
      ADD COLUMN IF NOT EXISTS approved_by TEXT,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS migrated_employee_record_id UUID,
      ADD COLUMN IF NOT EXISTS new_hiring_link_created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS new_hiring_link_accessed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS new_hiring_link_used_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS new_hiring_link_revoked_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS candidate_number_sequences (
      sequence_key TEXT PRIMARY KEY,
      last_value INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS applicant_previous_jobs (
      id BIGSERIAL PRIMARY KEY,
      applicant_id UUID NOT NULL REFERENCES online_registrations(record_id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      start_year INTEGER NOT NULL,
      end_year INTEGER,
      last_position TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT applicant_previous_jobs_year_chk CHECK (end_year IS NULL OR end_year >= start_year)
    );
    CREATE INDEX IF NOT EXISTS idx_previous_jobs_applicant ON applicant_previous_jobs(applicant_id);
    CREATE TABLE IF NOT EXISTS ocr_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      applicant_id UUID REFERENCES online_registrations(record_id) ON DELETE SET NULL,
      original_filename TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER,
      provider TEXT NOT NULL DEFAULT 'azure-document-intelligence',
      model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'uploaded',
      raw_result JSONB,
      parsed_result JSONB,
      warning TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_online_candidate_number
      ON online_registrations(candidate_number)
      WHERE candidate_number IS NOT NULL AND btrim(candidate_number) <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_online_new_hiring_link_token
      ON online_registrations(new_hiring_link_token)
      WHERE new_hiring_link_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_online_registration_status ON online_registrations(registration_status);
    CREATE INDEX IF NOT EXISTS idx_online_registration_nik ON online_registrations(nik);
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'online_registrations_ocr_document_fk'
      ) THEN
        ALTER TABLE online_registrations
          ADD CONSTRAINT online_registrations_ocr_document_fk
          FOREIGN KEY (ocr_source_document_id) REFERENCES ocr_documents(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  const duplicate = await client.query(
    "SELECT 1 FROM employees WHERE btrim(nik) <> '' GROUP BY nik HAVING COUNT(*) > 1 LIMIT 1",
  );
  if (duplicate.rowCount === 0) {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_nik_nonempty
      ON employees(nik) WHERE nik IS NOT NULL AND btrim(nik) <> ''`);
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION next_applicant_candidate_number()
    RETURNS TEXT AS $$
    DECLARE
      v_key TEXT := to_char(now(), 'MMHH');
      v_value INTEGER;
    BEGIN
      INSERT INTO candidate_number_sequences(sequence_key, last_value)
      VALUES (v_key, 1)
      ON CONFLICT (sequence_key) DO UPDATE
        SET last_value = candidate_number_sequences.last_value + 1,
            updated_at = now()
      RETURNING last_value INTO v_value;
      IF v_value > 999 THEN RAISE EXCEPTION 'Candidate number capacity exhausted for %', v_key; END IF;
      RETURN 'MOD' || v_key || lpad(v_value::text, 3, '0');
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Read-only helper for the Settings > Database "Storage Usage" card — PostgREST
  // (used in production) can't run pg_database_size() directly, only exposed functions.
  await client.query(`
    CREATE OR REPLACE FUNCTION get_database_size_bytes()
    RETURNS BIGINT AS $$
      SELECT pg_database_size(current_database());
    $$ LANGUAGE sql STABLE;
  `);
}

/** Seeds one default admin account so login isn't empty on first use. Never runs if any user already exists. */
async function seedDefaultUserIfEmpty(client: Client): Promise<void> {
  const { rows } = await client.query<{ c: string }>("SELECT COUNT(*)::int as c FROM users");
  if (Number(rows[0].c) > 0) return;
  const { hash, salt } = hashPassword(DEFAULT_PASSWORD);
  await client.query(
    `INSERT INTO users (name, username, email, role, status, permissions, password_hash, password_salt)
     VALUES ($1, $2, $3, $4, 'Active', $5, $6, $7)`,
    ["Admin User", "admin", "admin@ptmodindo.com", "HR Administrator", JSON.stringify(defaultModulePermissions()), hash, salt],
  );
}

export const PUBLIC_APPLY_TOKEN_KEY = "public_apply_token";

/** Seeds the one fixed token used to build the walk-in application QR code. Never rotated automatically — only an explicit "Regenerate" action changes it. */
async function ensurePublicApplyToken(client: Client): Promise<void> {
  const { rows } = await client.query("SELECT value FROM settings WHERE key = $1", [PUBLIC_APPLY_TOKEN_KEY]);
  if (rows.length > 0) return;
  await client.query(
    "INSERT INTO settings (key, value, description, updated_at) VALUES ($1, gen_random_uuid()::text, $2, now())",
    [PUBLIC_APPLY_TOKEN_KEY, "Fixed token for the walk-in application QR code."],
  );
}

/** Creates every table/index if missing. Idempotent — never drops or clears data. */
export async function ensureSchema(client: Client): Promise<void> {
  // Required by the UUID defaults used throughout the schema on plain
  // PostgreSQL installations (Supabase enables this extension by default).
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  await client.query(buildEmployeesTableSql());
  await ensureEmployeeColumnsExist(client);

  // Common employee-list filters and sorts. These are additive and idempotent
  // so rerunning db:init:postgres is safe on an existing database.
  await client.query("CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_employees_category ON employees(category);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_employees_join_date ON employees(join_date);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_employees_exit_date ON employees(exit_date);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);");

  for (const table of Object.values(SIMPLE_MASTER_SHEETS)) {
    const tableName = table.toLowerCase();
    await client.query(`CREATE TABLE IF NOT EXISTS ${tableName} (${SIMPLE_MASTER_TABLE_DDL});`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS lookup (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_lookup_type ON lookup(type);");
  await ensureLookupSeedsExist(client);

  // Settings > Master Data > Contract Criteria — each row's `periods` (JSON
  // array of { value, unit }) drives CONTRACT CLOSE-FIRST/SECOND/... auto-calc
  // from JOIN DATE. See lib/contract-dates.ts (calculateContractPeriodDates)
  // and lib/contract-criteria-service.ts.
  await client.query(`
    CREATE TABLE IF NOT EXISTS contract_criteria (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      periods JSONB NOT NULL DEFAULT '[]',
      applies_to_status TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  await client.query("ALTER TABLE contract_criteria ADD COLUMN IF NOT EXISTS applies_to_status TEXT NOT NULL DEFAULT '';");

  await client.query(`
    CREATE TABLE IF NOT EXISTS contract_history (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      employee_id TEXT NOT NULL,
      contract_type TEXT NOT NULL DEFAULT '',
      contract_start TEXT NOT NULL DEFAULT '',
      contract_end TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_contract_history_employee ON contract_history(employee_id);");

  // Employee Movement History (promosi/demosi/mutasi + the auto-logged
  // "Permanent" transition) — see lib/employee-movement-service.ts.
  // `applied` tracks whether the effective-date-triggered Department/Position
  // update (app/api/cron/apply-movements) has run for this row yet.
  await client.query(`
    CREATE TABLE IF NOT EXISTS employee_movement_history (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      employee_id TEXT NOT NULL,
      movement_type TEXT NOT NULL DEFAULT '',
      effective_date TEXT NOT NULL DEFAULT '',
      last_department TEXT NOT NULL DEFAULT '',
      last_position TEXT NOT NULL DEFAULT '',
      new_department TEXT NOT NULL DEFAULT '',
      new_position TEXT NOT NULL DEFAULT '',
      applied BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_employee_movement_employee ON employee_movement_history(employee_id);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_employee_movement_pending ON employee_movement_history(effective_date) WHERE applied = FALSE;");

  await client.query(`
    CREATE TABLE IF NOT EXISTS family (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      employee_id TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_family_employee ON family(employee_id);");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bpjs (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      employee_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_bpjs_employee ON bpjs(employee_id);");

  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await ensurePublicApplyToken(client);

  await client.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      user_name TEXT NOT NULL DEFAULT 'System',
      activity TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC, id DESC);");

  // Online Register — candidate drafts, shaped like `employees` (see
  // ensureOnlineRegistrationsEmployeeShaped) so the same EmployeeForm UI can
  // edit a registration exactly like editing a real employee.
  // `registration_status` (Pending/Approved/Rejected) is separate from the
  // employee-shaped `status` column (Active/Inactive) to avoid colliding.
  await client.query(`
    CREATE TABLE IF NOT EXISTS online_registrations (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      hp_number TEXT NOT NULL DEFAULT '',
      applied_position TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      registration_status TEXT NOT NULL DEFAULT 'Pending',
      submitted_at TEXT NOT NULL DEFAULT '',
      source_platform TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await ensureOnlineRegistrationsEmployeeShaped(client);
  await ensureApplicantPoolSchema(client);

  // User Management + login.
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      record_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      permissions TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await seedDefaultUserIfEmpty(client);

  // Role Access — module permissions per ROLE (not per user). One row per
  // role in config/user-roles.ts; self-heals via ensureRoleRows() in
  // lib/database/postgres-role-access.ts if a role is missing a row.
  await client.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT PRIMARY KEY,
      permissions TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Export Template Builder — admin-defined export structures. Never stores
  // employee data, only column/sheet configuration.
  await client.query(`
    CREATE TABLE IF NOT EXISTS export_templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      key_field TEXT NOT NULL DEFAULT 'nik',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS export_template_sheets (
      id BIGSERIAL PRIMARY KEY,
      template_id BIGINT NOT NULL REFERENCES export_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sheet_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_export_sheets_template ON export_template_sheets(template_id);");

  await client.query(`
    CREATE TABLE IF NOT EXISTS export_template_columns (
      id BIGSERIAL PRIMARY KEY,
      sheet_id BIGINT NOT NULL REFERENCES export_template_sheets(id) ON DELETE CASCADE,
      column_order INTEGER NOT NULL DEFAULT 0,
      column_type TEXT NOT NULL DEFAULT 'FIELD',
      source_field TEXT,
      display_label TEXT NOT NULL DEFAULT '',
      is_key BOOLEAN NOT NULL DEFAULT false,
      blank_value TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_export_columns_sheet ON export_template_columns(sheet_id);");

  // Attendance/Overtime module — mirror sqlite-init.ts table-for-table (see
  // comments there for the FK RESTRICT / no-FK-on-history rationale).
  await client.query(`
    CREATE TABLE IF NOT EXISTS bracket_master (
      id SERIAL PRIMARY KEY,
      day_type TEXT NOT NULL,
      durasi_start REAL NOT NULL,
      durasi_end REAL NOT NULL,
      ot_hours REAL NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT NOT NULL DEFAULT ''
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_bracket_master_day_type ON bracket_master(day_type);");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bracket_master_history (
      id SERIAL PRIMARY KEY,
      bracket_master_id INTEGER NOT NULL,
      day_type TEXT NOT NULL,
      durasi_start REAL,
      durasi_end REAL,
      ot_hours REAL,
      changed_by TEXT NOT NULL DEFAULT '',
      changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      change_type TEXT NOT NULL
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_bracket_master_history_bracket ON bracket_master_history(bracket_master_id);");

  await client.query(`
    CREATE TABLE IF NOT EXISTS raw_attendance (
      id BIGSERIAL PRIMARY KEY,
      nik TEXT NOT NULL,
      nama TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      tanggal TEXT NOT NULL,
      intime TEXT,
      outtime TEXT,
      it1 TEXT,
      ot1 TEXT,
      whour REAL,
      bhour REAL,
      othour_recorded REAL,
      kategori TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      imported_by TEXT NOT NULL DEFAULT '',
      source_filename TEXT NOT NULL DEFAULT '',
      UNIQUE (nik, tanggal)
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_raw_attendance_tanggal ON raw_attendance(tanggal);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_raw_attendance_nik ON raw_attendance(nik);");

  await client.query(`
    CREATE TABLE IF NOT EXISTS calculated_attendance (
      id BIGSERIAL PRIMARY KEY,
      raw_id BIGINT NOT NULL REFERENCES raw_attendance(id) ON DELETE RESTRICT,
      day_type TEXT NOT NULL,
      bracket_used TEXT NOT NULL DEFAULT '',
      system_calculated_oth REAL,
      final_oth REAL,
      status TEXT NOT NULL,
      corrected_by TEXT,
      corrected_at TIMESTAMPTZ,
      correction_note TEXT,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // runCrosscheck() uses upsert(..., { onConflict: "raw_id" }); the
  // calculated table must therefore enforce one result per raw attendance row.
  await client.query("CREATE UNIQUE INDEX IF NOT EXISTS uq_calculated_attendance_raw_id ON calculated_attendance(raw_id);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_calculated_attendance_raw ON calculated_attendance(raw_id);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_calculated_attendance_status ON calculated_attendance(status);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_raw_attendance_imported_at ON raw_attendance(imported_at);");
  await client.query("CREATE INDEX IF NOT EXISTS idx_raw_attendance_source_import ON raw_attendance(source_filename, imported_at);");

  // Read-side views for the attendance summary/list endpoints. Without these,
  // getImportHistory() / the processed-dates lookup / getCalculatedAttendance()
  // paged through every raw + calculated row over the PostgREST HTTP API and
  // did the GROUP BY / DISTINCT / join in JS — 9-20s per call in production.
  // Pushing the work into Postgres turns each endpoint into a single request.
  // PostgREST exposes views automatically (a schema reload may be needed right
  // after the first CREATE); the SQLite adapter keeps its own hand-written SQL.
  await client.query(`
    CREATE OR REPLACE VIEW attendance_import_history AS
    SELECT ra.source_filename,
           ra.imported_at,
           ra.imported_by,
           count(*)::int AS row_count,
           bool_and(ca.raw_id IS NOT NULL) AS all_processed
    FROM raw_attendance ra
    LEFT JOIN calculated_attendance ca ON ca.raw_id = ra.id
    GROUP BY ra.source_filename, ra.imported_at, ra.imported_by;
  `);
  await client.query(`
    CREATE OR REPLACE VIEW attendance_processed_dates AS
    SELECT DISTINCT ra.tanggal
    FROM calculated_attendance ca
    JOIN raw_attendance ra ON ra.id = ca.raw_id;
  `);
  await client.query(`
    CREATE OR REPLACE VIEW attendance_calculated_full AS
    SELECT ca.id, ca.raw_id, ca.day_type, ca.bracket_used, ca.system_calculated_oth,
           ca.final_oth, ca.status, ca.corrected_by, ca.corrected_at, ca.correction_note, ca.calculated_at,
           ra.nik, ra.nama, ra.department, ra.tanggal, ra.intime, ra.outtime, ra.it1, ra.ot1,
           ra.whour, ra.kategori, ra.othour_recorded
    FROM calculated_attendance ca
    JOIN raw_attendance ra ON ra.id = ca.raw_id;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ot_planning_estimates (
      id BIGSERIAL PRIMARY KEY,
      tanggal DATE NOT NULL,
      shed TEXT NOT NULL,
      division TEXT NOT NULL,
      duration REAL NOT NULL,
      person REAL NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tanggal, shed, division, duration)
    );
    CREATE TABLE IF NOT EXISTS ot_planning_config_history (
      id BIGSERIAL PRIMARY KEY,
      effective_date DATE NOT NULL UNIQUE,
      umr REAL NOT NULL,
      usd_rate REAL NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ot_estimate_date ON ot_planning_estimates(tanggal);
    CREATE INDEX IF NOT EXISTS idx_ot_config_date ON ot_planning_config_history(effective_date);
    CREATE TABLE IF NOT EXISTS ot_planning_mappings (
      id BIGSERIAL PRIMARY KEY,
      attendance_department TEXT NOT NULL UNIQUE,
      shed TEXT NOT NULL,
      division TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ot_planning_divisions (
      id BIGSERIAL PRIMARY KEY,
      shed TEXT NOT NULL,
      division TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (shed, division)
    );
    CREATE INDEX IF NOT EXISTS idx_ot_mapping_department ON ot_planning_mappings(attendance_department);
    CREATE TABLE IF NOT EXISTS ot_planning_duration_multipliers (
      id BIGSERIAL PRIMARY KEY,
      duration REAL NOT NULL UNIQUE,
      paid_hours REAL NOT NULL,
      paid_hours_holiday REAL NOT NULL DEFAULT 0,
      show_in_export BOOLEAN NOT NULL DEFAULT true
    );
  `);
  // Second pay bracket for OT rows whose kategori is "Hari Libur Pemerintah".
  await client.query("ALTER TABLE ot_planning_duration_multipliers ADD COLUMN IF NOT EXISTS paid_hours_holiday REAL NOT NULL DEFAULT 0;");
  // Excel export column visibility — a checked ("show in export") duration always
  // gets a column in the OT Planning workbook even when empty; the export unions
  // these with whatever durations carry data. One-time: when the column is first
  // added, seed the default (0.5–10 shown, above 10 hidden). Guarded so later
  // admin checkbox edits are never reset on re-run.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ot_planning_duration_multipliers' AND column_name = 'show_in_export'
      ) THEN
        ALTER TABLE ot_planning_duration_multipliers ADD COLUMN show_in_export BOOLEAN NOT NULL DEFAULT true;
        UPDATE ot_planning_duration_multipliers SET show_in_export = false WHERE duration > 10;
      END IF;
    END $$;
  `);
  // Report Time Overdue "Setup" tab — a checked duration means only attendance
  // rows whose FINAL OTH equals that duration are counted into the report (see
  // getTimeOverdueFilterDurations). Defaults to false/unchecked for every
  // duration so a fresh deploy shows the report unfiltered exactly as before
  // this feature existed (see getTimeOverdueReport's empty-set == no filter).
  await client.query(
    "ALTER TABLE ot_planning_duration_multipliers ADD COLUMN IF NOT EXISTS time_overdue_filter BOOLEAN NOT NULL DEFAULT false;",
  );

  // Report Mangkir — one row per (employee, absence episode, warning level)
  // once its "Kirim via WhatsApp" / "Download Surat" action has been used, so
  // the (live-recalculated, never-cached) report can show "sudah dikirim"
  // instead of asking HR to re-send the same warning letter on every Run.
  // `episode_start_date` is the first Mangkir date of the run — stable across
  // re-runs even as a still-ongoing episode grows longer, so a level-1 row
  // recorded early keeps matching the same episode once it also reaches
  // level 2. See lib/mangkir-service.ts.
  await client.query(`
    CREATE TABLE IF NOT EXISTS mangkir_warning_letters (
      id BIGSERIAL PRIMARY KEY,
      employee_id UUID NOT NULL,
      nik TEXT NOT NULL,
      level INTEGER NOT NULL,
      episode_start_date TEXT NOT NULL,
      trigger_dates TEXT NOT NULL,
      letter_number TEXT NOT NULL DEFAULT '',
      sent_at TIMESTAMPTZ,
      sent_by TEXT NOT NULL DEFAULT '',
      phone_number TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (employee_id, episode_start_date, level)
    );
    CREATE INDEX IF NOT EXISTS idx_mangkir_letters_employee ON mangkir_warning_letters(employee_id);
  `);
  // Free-text letter number (e.g. "5/HRD-SPK/VII/2026") — entered by HR at
  // PDF-download time (see saveMangkirLetterNumber), not auto-generated.
  await client.query("ALTER TABLE mangkir_warning_letters ADD COLUMN IF NOT EXISTS letter_number TEXT NOT NULL DEFAULT '';");
  // One-time backfill of the National Holiday bracket + the extra duration rows
  // it needs (regular bracket keeps whatever paid_hours it already had; only
  // rows still at the default 0 holiday value are touched, so admin edits made
  // later in the UI are never clobbered on re-run). show_in_export is set on
  // fresh inserts only — ON CONFLICT never touches it.
  for (const [duration, paidHoursRegular, paidHoursHoliday] of OT_DURATION_MULTIPLIER_SEED) {
    await client.query(
      `INSERT INTO ot_planning_duration_multipliers (duration, paid_hours, paid_hours_holiday, show_in_export)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (duration) DO UPDATE SET paid_hours_holiday = EXCLUDED.paid_hours_holiday
       WHERE ot_planning_duration_multipliers.paid_hours_holiday = 0`,
      [duration, paidHoursRegular, paidHoursHoliday, duration <= 10],
    );
  }

  // update_bracket_master(rows, changed_by, day_types) — bulk create/update/delete satu
  // day_type sekaligus + tulis bracket_master_history, atomik. Perlu fungsi
  // Postgres (bukan beberapa panggilan Supabase client biasa) dengan alasan
  // yang sama dengan approve_online_registration() di atas: request-time
  // Postgres access di app ini lewat PostgREST (lib/supabase.ts), yang tidak
  // punya BEGIN/COMMIT lintas-statement — SQLite dapat itu gratis lewat
  // BEGIN/COMMIT/ROLLBACK (lihat sqlite-attendance.ts).
  //
  // p_rows: JSONB array of {id?, day_type, durasi_start, durasi_end, ot_hours}
  // p_day_types: day_type yang disentuh caller, termasuk saat p_rows kosong.
  // Baris existing di day_type yang sama tapi TIDAK ada di p_rows -> dihapus.
  await client.query(`
    DROP FUNCTION IF EXISTS update_bracket_master(JSONB, TEXT);
    CREATE OR REPLACE FUNCTION update_bracket_master(p_rows JSONB, p_changed_by TEXT, p_day_types TEXT[] DEFAULT NULL)
    RETURNS void AS $$
    DECLARE
      v_day_types TEXT[];
      v_row RECORD;
      v_incoming_ids INTEGER[];
      v_existing RECORD;
      v_new_id INTEGER;
    BEGIN
      SELECT array_agg(DISTINCT day_type) INTO v_day_types
      FROM (
        SELECT unnest(COALESCE(p_day_types, ARRAY[]::TEXT[])) AS day_type
        UNION
        SELECT x.day_type
        FROM jsonb_to_recordset(p_rows) AS x(id INTEGER, day_type TEXT, durasi_start REAL, durasi_end REAL, ot_hours REAL)
      ) touched
      WHERE day_type IS NOT NULL;

      IF v_day_types IS NULL THEN
        RETURN; -- rows kosong -> no-op
      END IF;

      SELECT array_agg(x.id) INTO v_incoming_ids
      FROM jsonb_to_recordset(p_rows) AS x(id INTEGER, day_type TEXT, durasi_start REAL, durasi_end REAL, ot_hours REAL)
      WHERE x.id IS NOT NULL;

      -- Hapus baris existing (di day_type yang disentuh p_rows) yang id-nya tidak lagi ada di p_rows.
      FOR v_existing IN
        SELECT * FROM bracket_master
        WHERE day_type = ANY(v_day_types)
          AND (v_incoming_ids IS NULL OR NOT (id = ANY(v_incoming_ids)))
      LOOP
        INSERT INTO bracket_master_history (bracket_master_id, day_type, durasi_start, durasi_end, ot_hours, changed_by, changed_at, change_type)
        VALUES (v_existing.id, v_existing.day_type, v_existing.durasi_start, v_existing.durasi_end, v_existing.ot_hours, p_changed_by, now(), 'deleted');
        DELETE FROM bracket_master WHERE id = v_existing.id;
      END LOOP;

      FOR v_row IN
        SELECT * FROM jsonb_to_recordset(p_rows) AS x(id INTEGER, day_type TEXT, durasi_start REAL, durasi_end REAL, ot_hours REAL)
      LOOP
        IF v_row.id IS NULL THEN
          INSERT INTO bracket_master (day_type, durasi_start, durasi_end, ot_hours, updated_at, updated_by)
          VALUES (v_row.day_type, v_row.durasi_start, v_row.durasi_end, v_row.ot_hours, now(), p_changed_by)
          RETURNING id INTO v_new_id;
          INSERT INTO bracket_master_history (bracket_master_id, day_type, durasi_start, durasi_end, ot_hours, changed_by, changed_at, change_type)
          VALUES (v_new_id, v_row.day_type, NULL, NULL, NULL, p_changed_by, now(), 'created');
        ELSE
          SELECT * INTO v_existing FROM bracket_master WHERE id = v_row.id;
          IF v_existing.id IS NOT NULL AND (
            v_existing.durasi_start IS DISTINCT FROM v_row.durasi_start OR
            v_existing.durasi_end IS DISTINCT FROM v_row.durasi_end OR
            v_existing.ot_hours IS DISTINCT FROM v_row.ot_hours
          ) THEN
            INSERT INTO bracket_master_history (bracket_master_id, day_type, durasi_start, durasi_end, ot_hours, changed_by, changed_at, change_type)
            VALUES (v_existing.id, v_existing.day_type, v_existing.durasi_start, v_existing.durasi_end, v_existing.ot_hours, p_changed_by, now(), 'updated');
            UPDATE bracket_master
            SET durasi_start = v_row.durasi_start, durasi_end = v_row.durasi_end, ot_hours = v_row.ot_hours,
                updated_at = now(), updated_by = p_changed_by
            WHERE id = v_existing.id;
          END IF;
        END IF;
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // approve_online_registration(record_id, employee_fields) — atomically
  // inserts an already-prepared employee row (built in JS by
  // postgres-online-registrations.ts, finger code included — that
  // generation logic stays in lib/database/finger-code.ts, not duplicated
  // here) and marks the registration Approved, so a failure partway through
  // can never leave a "ghost" employee with the registration still stuck on
  // Pending (the risk the Sheets version explicitly could not avoid — see
  // google-sheets-online-registrations.ts). Re-validates Pending status
  // inside the transaction to close the race window the app-layer check
  // alone can't close.
  const writableColumnList = WRITABLE_EMPLOYEE_COLUMNS.map((c) => c.column).join(", ");
  const writableColumnDefs = WRITABLE_EMPLOYEE_COLUMNS.map((c) => `${c.column} TEXT`).join(", ");
  await client.query(`
    CREATE OR REPLACE FUNCTION approve_online_registration(p_record_id UUID, p_employee_fields JSONB, p_approved_by TEXT DEFAULT NULL)
    RETURNS UUID AS $$
    DECLARE
      v_employee_record_id UUID;
      v_pending_count INT;
    BEGIN
      SELECT count(*) INTO v_pending_count FROM online_registrations
        WHERE record_id = p_record_id AND lower(registration_status) = 'pending';
      IF v_pending_count = 0 THEN
        SELECT migrated_employee_record_id INTO v_employee_record_id FROM online_registrations
          WHERE record_id = p_record_id AND lower(registration_status) = 'approved';
        IF v_employee_record_id IS NOT NULL THEN RETURN v_employee_record_id; END IF;
        RAISE EXCEPTION 'Online registration % not found or not pending', p_record_id;
      END IF;

      IF NULLIF(btrim(p_employee_fields->>'nik'), '') IS NOT NULL AND EXISTS (
        SELECT 1 FROM employees WHERE nik = p_employee_fields->>'nik'
      ) THEN
        RAISE EXCEPTION 'NIK % already exists in employees', p_employee_fields->>'nik';
      END IF;

      INSERT INTO employees (${writableColumnList})
      SELECT ${writableColumnList} FROM jsonb_to_record(p_employee_fields) AS x(${writableColumnDefs})
      RETURNING record_id INTO v_employee_record_id;

      UPDATE online_registrations
      SET registration_status = 'Approved', approved_by = p_approved_by, approved_at = now(), archived_at = now(),
          migrated_employee_record_id = v_employee_record_id, updated_at = now()
      WHERE record_id = p_record_id;

      RETURN v_employee_record_id;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

/** Seeds each master data table with a handful of sample rows — ONLY if the table is currently empty. Never touches a table that already has data. Returns which tables were seeded, for `npm run db:init:postgres` reporting. */
export async function seedMasterDataIfEmpty(client: Client): Promise<Record<string, boolean>> {
  const seeded: Record<string, boolean> = {};

  for (const [category, table] of Object.entries(SIMPLE_MASTER_SHEETS)) {
    const tableName = table.toLowerCase();
    const { rows } = await client.query<{ c: string }>(`SELECT COUNT(*)::int as c FROM ${tableName}`);
    if (Number(rows[0].c) > 0) {
      seeded[table] = false;
      continue;
    }
    const seedRows = SIMPLE_MASTER_SEED[category as keyof typeof SIMPLE_MASTER_SEED];
    for (const [idx, row] of seedRows.entries()) {
      await client.query("INSERT INTO " + tableName + " (code, name, status, sort_order) VALUES ($1, $2, 'Active', $3)", [
        row.code,
        row.name,
        idx + 1,
      ]);
    }
    seeded[table] = true;
  }

  const { rows: lookupCountRows } = await client.query<{ c: string }>("SELECT COUNT(*)::int as c FROM lookup");
  if (Number(lookupCountRows[0].c) === 0) {
    for (const { type } of LOOKUP_TYPES) {
      const seedRows = LOOKUP_SEED[type];
      for (const [idx, row] of seedRows.entries()) {
        await client.query(
          "INSERT INTO lookup (type, code, name, status, sort_order) VALUES ($1, $2, $3, 'Active', $4)",
          [type, row.code, row.name, idx + 1],
        );
      }
    }
    seeded.Lookup = true;
  } else {
    seeded.Lookup = false;
  }

  const { rows: mappingRows } = await client.query<{ c: string }>("SELECT COUNT(*)::int AS c FROM ot_planning_mappings");
  if (Number(mappingRows[0].c) === 0) { for (const [idx, line] of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].entries()) await client.query("INSERT INTO ot_planning_mappings (attendance_department, shed, division, display_order) VALUES ($1, 'SHED A', $2, $3) ON CONFLICT DO NOTHING", [`SEWING LINE ${String(line).padStart(2, "0")} SHED A.`, `SEW L${line}`, idx]); seeded.OtPlanningMappings = true; } else seeded.OtPlanningMappings = false;
  const { rows: divisionRows } = await client.query<{ c: string }>("SELECT COUNT(*)::int AS c FROM ot_planning_divisions");
  if (Number(divisionRows[0].c) === 0) { const defaults: Record<string, string[]> = { "SHED A": ["CUTTING", ...Array.from({ length: 10 }, (_, i) => `SEW L${i + 1}`), "QC", "ADM PRODUKSI", "MEKANIK"], "SHED B": ["CUTTING", "FINISHING", ...Array.from({ length: 10 }, (_, i) => `SEW L${i + 13}`), "SEW L14B", "QC", "ADM PRODUKSI", "MEKANIK"], "SHED C": ["CUTTING", "FINISHING", ...Array.from({ length: 5 }, (_, i) => `SEW L${i + 23}`), "SEW L28-32", "CNC", "QC", "ADM PRODUKSI", "MEKANIK"], COMMON: ["HRD & GA & DRIVER & CS & ELEKTRIK & perawat", "IE", "SAMPLE JSS", "QC COMMON", "SAMPLE OP WORKER", "SEWING COMMON", "WAREHOUSE", "PPIC & MD & EXIM", "SAMPLE OP STAFF"] }; for (const [shed, names] of Object.entries(defaults)) for (const [idx, division] of names.entries()) await client.query("INSERT INTO ot_planning_divisions (shed, division, display_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [shed, division, idx]); seeded.OtPlanningDivisions = true; } else seeded.OtPlanningDivisions = false;
  const { rows: multiplierRows } = await client.query<{ c: string }>("SELECT COUNT(*)::int AS c FROM ot_planning_duration_multipliers");
  if (Number(multiplierRows[0].c) === 0) { for (const [duration, paid, paidHoliday] of OT_DURATION_MULTIPLIER_SEED) await client.query("INSERT INTO ot_planning_duration_multipliers (duration, paid_hours, paid_hours_holiday, show_in_export) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [duration, paid, paidHoliday, duration <= 10]); seeded.OtPlanningDurationMultipliers = true; } else seeded.OtPlanningDurationMultipliers = false;

  return seeded;
}
