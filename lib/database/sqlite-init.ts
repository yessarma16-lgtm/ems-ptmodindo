import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { SIMPLE_MASTER_SHEETS, LOOKUP_TYPES } from "@/config/master-data-sheets";
import { SIMPLE_MASTER_SEED, LOOKUP_SEED } from "@/config/master-data-seed";
import { EMPLOYEE_COLUMNS } from "@/lib/database/sqlite-columns";
import { defaultModulePermissions } from "@/config/module-permissions";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth/password";

/**
 * SQLite schema + seed for the DEVELOPMENT database provider
 * (`DATABASE_PROVIDER=sqlite`). Mirrors the Google Spreadsheet structure
 * from STEP 2 exactly:
 *   employees, departments, positions, levels, skills, banks, lookup,
 *   contract_history, family, bpjs, settings
 *
 * Every statement is `CREATE TABLE IF NOT EXISTS` / a guarded INSERT — safe
 * to run on every app start and from `npm run db:init:sqlite` repeatedly.
 * Never drops or clears a table.
 */

export function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

export function getDbPath(): string {
  return path.join(getDataDir(), "employee.db");
}

export function ensureDataDir(): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

const SIMPLE_MASTER_TABLE_DDL = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  sort_order INTEGER NOT NULL DEFAULT 0
`;

function buildEmployeesTableSql(): string {
  const fieldColumns = EMPLOYEE_COLUMNS.map((c) => `  ${c.column} TEXT NOT NULL DEFAULT ''`).join(",\n");
  return `
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE NOT NULL,
${fieldColumns},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
}

/**
 * Adds any Employee columns that are missing from an EXISTING `employees`
 * table (e.g. fields appended to config/employee-fields.ts after the table
 * was first created, such as Blood Type / Email / Branch). Additive only —
 * `ALTER TABLE ADD COLUMN` never touches existing rows/columns.
 */
function ensureEmployeeColumnsExist(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(employees)").all() as { name: string }[]).map((r) => r.name),
  );
  for (const c of EMPLOYEE_COLUMNS) {
    if (!existingColumns.has(c.column)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${c.column} TEXT NOT NULL DEFAULT ''`);
    }
  }
}

/**
 * Adds any Lookup rows from config/master-data-seed.ts that are missing from
 * an EXISTING `lookup` table — new TYPEs (e.g. BLOOD_TYPE) added after the
 * table was first seeded, or new codes appended to an existing TYPE (e.g.
 * CATEGORY gaining "EXPATRIATE"). Additive only — never edits or removes an
 * existing row, so admin edits to master data are never touched.
 */
function ensureLookupSeedsExist(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare("SELECT type, code FROM lookup").all() as { type: string; code: string }[]).map(
      (r) => `${r.type}::${r.code}`,
    ),
  );
  const maxSortOrderByType = new Map<string, number>();
  const insert = db.prepare(
    "INSERT INTO lookup (type, code, name, status, sort_order) VALUES (?, ?, ?, 'Active', ?)",
  );
  for (const { type } of LOOKUP_TYPES) {
    const rows = LOOKUP_SEED[type];
    for (const row of rows) {
      if (existing.has(`${type}::${row.code}`)) continue;
      if (!maxSortOrderByType.has(type)) {
        const maxRow = db
          .prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM lookup WHERE type = ?")
          .get(type) as { m: number };
        maxSortOrderByType.set(type, maxRow.m);
      }
      const nextSortOrder = (maxSortOrderByType.get(type) ?? 0) + 1;
      maxSortOrderByType.set(type, nextSortOrder);
      insert.run(type, row.code, row.name, nextSortOrder);
    }
  }
}

/** Adds the `permissions` column to an EXISTING `users` table created before Module Access was added. Additive only. */
function ensureUsersPermissionsColumn(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((r) => r.name),
  );
  if (!existingColumns.has("permissions")) {
    db.exec("ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT ''");
  }
}

/** Adds password_hash/password_salt to an EXISTING `users` table created before login existed. Additive only. */
function ensureUsersPasswordColumns(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((r) => r.name),
  );
  if (!existingColumns.has("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.has("password_salt")) {
    db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''");
  }
}

/**
 * Backfills a default password for any account that predates the login
 * system (password_hash still empty) — otherwise it could never sign in.
 * Never touches an account that already has a password set.
 */
function ensureUsersHavePasswords(db: DatabaseSync): void {
  const rows = db.prepare("SELECT id FROM users WHERE password_hash = '' OR password_hash IS NULL").all() as {
    id: number;
  }[];
  if (rows.length === 0) return;
  const { hash, salt } = hashPassword(DEFAULT_PASSWORD);
  const update = db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?");
  for (const row of rows) update.run(hash, salt, row.id);
}

/**
 * Makes `online_registrations` mirror every `employees` column (nik,
 * department, position, birthDate, ...) so a registration can be edited
 * with the exact same EmployeeForm used for real employees, and approving
 * one is just copying its row into `employees`. The original `status`
 * column (Pending/Approved/Rejected) is renamed to `registration_status`
 * first so it doesn't collide with the employee-shaped `status` column
 * (Active/Inactive) added afterward. Safe to run repeatedly; additive only.
 */
function ensureOnlineRegistrationsEmployeeShaped(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(online_registrations)").all() as { name: string }[]).map((r) => r.name),
  );
  if (existingColumns.has("status") && !existingColumns.has("registration_status")) {
    db.exec("ALTER TABLE online_registrations RENAME COLUMN status TO registration_status");
    existingColumns.delete("status");
    existingColumns.add("registration_status");
  }
  if (!existingColumns.has("registration_status")) {
    db.exec("ALTER TABLE online_registrations ADD COLUMN registration_status TEXT NOT NULL DEFAULT 'Pending'");
  }
  if (!existingColumns.has("submitted_at")) {
    db.exec("ALTER TABLE online_registrations ADD COLUMN submitted_at TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.has("source_platform")) {
    db.exec("ALTER TABLE online_registrations ADD COLUMN source_platform TEXT NOT NULL DEFAULT ''");
  }
  for (const c of EMPLOYEE_COLUMNS) {
    if (!existingColumns.has(c.column)) {
      db.exec(`ALTER TABLE online_registrations ADD COLUMN ${c.column} TEXT NOT NULL DEFAULT ''`);
    }
  }
}

/** Applicant Pool/New Hiring additions. Additive and safe for existing databases. */
function ensureApplicantPoolSchema(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(online_registrations)").all() as { name: string }[]).map((r) => r.name),
  );
  const columns: Record<string, string> = {
    candidate_number: "TEXT",
    access_channel: "TEXT",
    duplicate_check_result: "TEXT",
    ocr_source_document_id: "TEXT",
    new_hiring_link_token: "TEXT",
    new_hiring_link_expiry: "TEXT",
    new_hiring_link_status: "TEXT",
    approved_by: "TEXT",
    approved_at: "TEXT",
    archived_at: "TEXT",
    migrated_employee_record_id: "TEXT",
    new_hiring_link_created_at: "TEXT",
    new_hiring_link_accessed_at: "TEXT",
    new_hiring_link_used_at: "TEXT",
    new_hiring_link_revoked_at: "TEXT",
  };
  for (const [column, type] of Object.entries(columns)) {
    if (!existingColumns.has(column)) db.exec(`ALTER TABLE online_registrations ADD COLUMN ${column} ${type}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_number_sequences (
      sequence_key TEXT PRIMARY KEY,
      last_value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applicant_previous_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id TEXT NOT NULL REFERENCES online_registrations(record_id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      start_year INTEGER NOT NULL,
      end_year INTEGER,
      last_position TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (end_year IS NULL OR end_year >= start_year)
    );
    CREATE INDEX IF NOT EXISTS idx_previous_jobs_applicant ON applicant_previous_jobs(applicant_id);
    CREATE TABLE IF NOT EXISTS ocr_documents (
      id TEXT PRIMARY KEY,
      applicant_id TEXT REFERENCES online_registrations(record_id) ON DELETE SET NULL,
      original_filename TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER,
      provider TEXT NOT NULL DEFAULT 'azure-document-intelligence',
      model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'uploaded',
      raw_result TEXT,
      parsed_result TEXT,
      warning TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_online_candidate_number
      ON online_registrations(candidate_number)
      WHERE candidate_number IS NOT NULL AND trim(candidate_number) <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_online_new_hiring_link_token
      ON online_registrations(new_hiring_link_token)
      WHERE new_hiring_link_token IS NOT NULL AND trim(new_hiring_link_token) <> '';
    CREATE INDEX IF NOT EXISTS idx_online_registration_status ON online_registrations(registration_status);
    CREATE INDEX IF NOT EXISTS idx_online_registration_nik ON online_registrations(nik);
  `);

  const duplicate = db.prepare(
    "SELECT 1 FROM employees WHERE trim(nik) <> '' GROUP BY nik HAVING COUNT(*) > 1 LIMIT 1",
  ).get();
  if (!duplicate) {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_nik_nonempty
      ON employees(nik) WHERE nik IS NOT NULL AND trim(nik) <> ''`);
  }
}

/** Adds `username` to an EXISTING `users` table created before it existed. Additive only. */
function ensureUsersUsernameColumn(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((r) => r.name),
  );
  if (!existingColumns.has("username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''");
  }
}

/** Backfills a username (from the email's local part) for any account that predates the username field. */
function ensureUsersHaveUsernames(db: DatabaseSync): void {
  const rows = db.prepare("SELECT id, email FROM users WHERE username = '' OR username IS NULL").all() as {
    id: number;
    email: string;
  }[];
  if (rows.length === 0) return;
  const update = db.prepare("UPDATE users SET username = ? WHERE id = ?");
  for (const row of rows) {
    const fallback = (row.email.split("@")[0] || `user${row.id}`).toLowerCase();
    update.run(fallback, row.id);
  }
}

/** Seeds one default account so My Profile / User Management aren't empty on first load. Never runs if any user already exists. */
function seedDefaultUserIfEmpty(db: DatabaseSync): void {
  const count = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (count > 0) return;
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(DEFAULT_PASSWORD);
  db.prepare(
    "INSERT INTO users (record_id, name, username, email, role, status, permissions, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?)",
  ).run(
    crypto.randomUUID(),
    "Admin User",
    "admin",
    "admin@ptmodindo.com",
    "HR Administrator",
    JSON.stringify(defaultModulePermissions()),
    hash,
    salt,
    now,
    now,
  );
}

export const PUBLIC_APPLY_TOKEN_KEY = "public_apply_token";

/**
 * Seeds the one fixed token used to build the walk-in application QR code
 * (Online Register). Generated once and never rotated automatically — the
 * same token (and therefore the same QR image / URL) survives every server
 * restart, so a printed poster keeps working. Only an explicit "Regenerate"
 * action (lib/settings-service.ts) ever changes it.
 */
function ensurePublicApplyToken(db: DatabaseSync): void {
  const existing = db.prepare("SELECT value FROM settings WHERE key = ?").get(PUBLIC_APPLY_TOKEN_KEY);
  if (existing) return;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)",
  ).run(PUBLIC_APPLY_TOKEN_KEY, crypto.randomUUID(), "Fixed token for the walk-in application QR code.", now);
}

/** Creates every table/index if missing. Idempotent — never drops or clears data. */
export function ensureSchema(db: DatabaseSync): void {
  db.exec(buildEmployeesTableSql());
  ensureEmployeeColumnsExist(db);

  for (const table of Object.values(SIMPLE_MASTER_SHEETS)) {
    const tableName = table.toLowerCase();
    db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${SIMPLE_MASTER_TABLE_DDL});`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lookup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lookup_type ON lookup(type);
  `);
  ensureLookupSeedsExist(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE NOT NULL,
      employee_id TEXT NOT NULL,
      contract_type TEXT NOT NULL DEFAULT '',
      contract_start TEXT NOT NULL DEFAULT '',
      contract_end TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contract_history_employee ON contract_history(employee_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS family (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE NOT NULL,
      employee_id TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_family_employee ON family(employee_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bpjs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE NOT NULL,
      employee_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bpjs_employee ON bpjs(employee_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);
  ensurePublicApplyToken(db);

  // Online Register — candidate drafts. Shaped like `employees` (see
  // ensureOnlineRegistrationsEmployeeShaped below) so the same EmployeeForm
  // UI can edit a registration exactly like editing a real employee.
  // `registration_status` (Pending/Approved/Rejected) is separate from the
  // employee-shaped `status` column (Active/Inactive) to avoid colliding.
  db.exec(`
    CREATE TABLE IF NOT EXISTS online_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      hp_number TEXT NOT NULL DEFAULT '',
      applied_position TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureOnlineRegistrationsEmployeeShaped(db);
  ensureApplicantPoolSchema(db);

  // User Management + login. Accounts sign in via /login (see
  // lib/auth/*.ts). Role Access (module permissions) is stored per role
  // but not yet enforced anywhere in the UI.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      permissions TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureUsersPermissionsColumn(db);
  ensureUsersPasswordColumns(db);
  ensureUsersUsernameColumn(db);
  seedDefaultUserIfEmpty(db);
  ensureUsersHavePasswords(db);
  ensureUsersHaveUsernames(db);

  // Role Access — module permissions configured per ROLE (not per user).
  // One row per role in config/user-roles.ts; self-heals via
  // ensureRoleRows() in lib/database/sqlite-role-access.ts if a role is
  // missing a row (e.g. a new role was added to the config).
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT PRIMARY KEY,
      permissions TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  // Export Template Builder (STEP 3) — admin-defined export structures.
  // Never stores employee data, only column/sheet configuration.
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      key_field TEXT NOT NULL DEFAULT 'nik',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS export_template_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES export_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sheet_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_export_sheets_template ON export_template_sheets(template_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS export_template_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_id INTEGER NOT NULL REFERENCES export_template_sheets(id) ON DELETE CASCADE,
      column_order INTEGER NOT NULL DEFAULT 0,
      column_type TEXT NOT NULL DEFAULT 'FIELD',
      source_field TEXT,
      display_label TEXT NOT NULL DEFAULT '',
      is_key INTEGER NOT NULL DEFAULT 0,
      blank_value TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_export_columns_sheet ON export_template_columns(sheet_id);
  `);

  // Attendance/Overtime module (docs/ATTENDANCE_OVERTIME_MODULE_SPEC.md).
  // Brand new tables — nothing to migrate from yet, so no
  // ensure*ColumnsExist() helper is written here. If a column needs to be
  // added later (after real data exists), follow the same pattern already
  // used above for `employees`/`users`/`online_registrations`: check
  // `PRAGMA table_info(<table>)`, then `ALTER TABLE ... ADD COLUMN` for
  // whatever's missing, called every ensureSchema() run (see
  // ensureEmployeeColumnsExist / ensureUsersPermissionsColumn above).
  db.exec(`
    CREATE TABLE IF NOT EXISTS bracket_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_type TEXT NOT NULL,
      durasi_start REAL NOT NULL,
      durasi_end REAL NOT NULL,
      ot_hours REAL NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_bracket_master_day_type ON bracket_master(day_type);
  `);

  // Riwayat perubahan bracket_master — snapshot nilai LAMA sebelum diubah,
  // ditulis SEBELUM setiap create/update/delete (lihat
  // sqlite-attendance.ts). `bracket_master_id` sengaja TANPA FK constraint
  // (sama seperti audit_log.entity_id di atas) karena riwayat "deleted"
  // harus tetap ada meski baris bracket_master-nya sudah benar-benar
  // dihapus — sebuah FK di sini akan memblokir penghapusan itu.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bracket_master_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bracket_master_id INTEGER NOT NULL,
      day_type TEXT NOT NULL,
      durasi_start REAL,
      durasi_end REAL,
      ot_hours REAL,
      changed_by TEXT NOT NULL DEFAULT '',
      changed_at TEXT NOT NULL,
      change_type TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bracket_master_history_bracket ON bracket_master_history(bracket_master_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      imported_at TEXT NOT NULL,
      imported_by TEXT NOT NULL DEFAULT '',
      source_filename TEXT NOT NULL DEFAULT '',
      UNIQUE (nik, tanggal)
    );
    CREATE INDEX IF NOT EXISTS idx_raw_attendance_tanggal ON raw_attendance(tanggal);
    CREATE INDEX IF NOT EXISTS idx_raw_attendance_nik ON raw_attendance(nik);
  `);

  // raw_id -> RESTRICT (bukan CASCADE): raw_attendance adalah "sumber
  // kebenaran" dan calculated_attendance bisa menyimpan koreksi manual
  // (correction_note/corrected_by) yang punya nilai audit sendiri —
  // menghapus raw_attendance yang sudah pernah dihitung TIDAK BOLEH diam-diam
  // membuang jejak koreksi itu. Beda dari satu-satunya preseden FK+CASCADE
  // yang ada (export_template_sheets/columns), yang murni data komposisi
  // tanpa nilai audit sendiri. Ditegakkan lewat DDL + `PRAGMA foreign_keys =
  // ON` di sqlite-connection.ts (SQLite tidak enforce FK by default kalau
  // pragma itu tidak diaktifkan).
  db.exec(`
    CREATE TABLE IF NOT EXISTS calculated_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_id INTEGER NOT NULL REFERENCES raw_attendance(id) ON DELETE RESTRICT,
      day_type TEXT NOT NULL,
      bracket_used TEXT NOT NULL DEFAULT '',
      system_calculated_oth REAL,
      final_oth REAL,
      status TEXT NOT NULL,
      corrected_by TEXT,
      corrected_at TEXT,
      correction_note TEXT,
      calculated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_calculated_attendance_raw ON calculated_attendance(raw_id);
    CREATE INDEX IF NOT EXISTS idx_calculated_attendance_status ON calculated_attendance(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ot_planning_estimates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,
      shed TEXT NOT NULL,
      division TEXT NOT NULL,
      duration REAL NOT NULL,
      person REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (tanggal, shed, division, duration)
    );
    CREATE TABLE IF NOT EXISTS ot_planning_config_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      effective_date TEXT NOT NULL,
      umr REAL NOT NULL,
      usd_rate REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ot_estimate_date ON ot_planning_estimates(tanggal);
    CREATE INDEX IF NOT EXISTS idx_ot_config_date ON ot_planning_config_history(effective_date);
    CREATE TABLE IF NOT EXISTS ot_planning_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_department TEXT NOT NULL UNIQUE,
      shed TEXT NOT NULL,
      division TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ot_planning_divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shed TEXT NOT NULL,
      division TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (shed, division)
    );
    CREATE INDEX IF NOT EXISTS idx_ot_mapping_department ON ot_planning_mappings(attendance_department);
    CREATE TABLE IF NOT EXISTS ot_planning_duration_multipliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration REAL NOT NULL UNIQUE,
      paid_hours REAL NOT NULL
    );
  `);
}

/**
 * Seeds each master data table with a handful of sample rows — ONLY if the
 * table is currently empty. Never touches a table that already has data.
 * Returns which tables were seeded, for `npm run db:init:sqlite` reporting.
 */
export function seedMasterDataIfEmpty(db: DatabaseSync): Record<string, boolean> {
  const seeded: Record<string, boolean> = {};

  for (const [category, table] of Object.entries(SIMPLE_MASTER_SHEETS)) {
    const tableName = table.toLowerCase();
    const countRow = db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get() as { c: number };
    if (countRow.c > 0) {
      seeded[table] = false;
      continue;
    }
    const insert = db.prepare(
      `INSERT INTO ${tableName} (code, name, status, sort_order) VALUES (?, ?, 'Active', ?)`,
    );
    const rows = SIMPLE_MASTER_SEED[category as keyof typeof SIMPLE_MASTER_SEED];
    rows.forEach((row, idx) => insert.run(row.code, row.name, idx + 1));
    seeded[table] = true;
  }

  const lookupCount = db.prepare("SELECT COUNT(*) as c FROM lookup").get() as { c: number };
  if (lookupCount.c === 0) {
    const insert = db.prepare(
      "INSERT INTO lookup (type, code, name, status, sort_order) VALUES (?, ?, ?, 'Active', ?)",
    );
    for (const { type } of LOOKUP_TYPES) {
      const rows = LOOKUP_SEED[type];
      rows.forEach((row, idx) => insert.run(type, row.code, row.name, idx + 1));
    }
    seeded.Lookup = true;
  } else {
    seeded.Lookup = false;
  }

  const mappingCount = db.prepare("SELECT COUNT(*) as c FROM ot_planning_mappings").get() as { c: number };
  if (mappingCount.c === 0) {
    const rows = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const insert = db.prepare("INSERT INTO ot_planning_mappings (attendance_department, shed, division, display_order) VALUES (?, 'SHED A', ?, ?)");
    rows.forEach((line, idx) => insert.run(`SEWING LINE ${String(line).padStart(2, "0")} SHED A.`, `SEW L${line}`, idx));
    seeded.OtPlanningMappings = true;
  } else seeded.OtPlanningMappings = false;
  const divisionCount = db.prepare("SELECT COUNT(*) as c FROM ot_planning_divisions").get() as { c: number };
  if (divisionCount.c === 0) { const insert = db.prepare("INSERT INTO ot_planning_divisions (shed, division, display_order) VALUES (?, ?, ?)"); Object.entries({ "SHED A": ["CUTTING", ...Array.from({ length: 10 }, (_, i) => `SEW L${i + 1}`), "QC", "ADM PRODUKSI", "MEKANIK"], "SHED B": ["CUTTING", "FINISHING", ...Array.from({ length: 10 }, (_, i) => `SEW L${i + 13}`), "SEW L14B", "QC", "ADM PRODUKSI", "MEKANIK"], "SHED C": ["CUTTING", "FINISHING", ...Array.from({ length: 5 }, (_, i) => `SEW L${i + 23}`), "SEW L28-32", "CNC", "QC", "ADM PRODUKSI", "MEKANIK"], COMMON: ["HRD & GA & DRIVER & CS & ELEKTRIK & perawat", "IE", "SAMPLE JSS", "QC COMMON", "SAMPLE OP WORKER", "SEWING COMMON", "WAREHOUSE", "PPIC & MD & EXIM", "SAMPLE OP STAFF"] }).forEach(([shed, names]) => (names as string[]).forEach((division, idx) => insert.run(shed, division, idx))); seeded.OtPlanningDivisions = true; } else seeded.OtPlanningDivisions = false;
  const multiplierCount = db.prepare("SELECT COUNT(*) as c FROM ot_planning_duration_multipliers").get() as { c: number };
  if (multiplierCount.c === 0) { const insert = db.prepare("INSERT INTO ot_planning_duration_multipliers (duration, paid_hours) VALUES (?, ?)"); [[0.5,0.75],[1,1.5],[1.5,2.5],[2,3.5],[2.5,4.5],[3,5.5],[3.5,6.5],[4,7.5],[4.5,8.5],[5,9.5],[5.5,10.5],[6,11.5],[6.5,12.5],[7,13.5],[7.5,14.5],[8,15.5],[8.5,16.5],[9,17.5],[9.5,18.5],[10,19.5],[11,21.5],[12,22.5],[13,23.5]].forEach(([duration, paid]) => insert.run(duration, paid)); seeded.OtPlanningDurationMultipliers = true; } else seeded.OtPlanningDurationMultipliers = false;

  return seeded;
}
