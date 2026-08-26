/**
 * SINGLE SOURCE OF TRUTH for the Employee Master data model.
 *
 * Every field below is derived 1:1 from `db_mod.xlsx` (Sheet1, row 1),
 * columns A..BC (55 fields), in the exact original order.
 *
 * - `tabOrder` mirrors the original spreadsheet column order, so keyboard
 *   TAB navigation on the Employee Form always follows `db_mod.xlsx`,
 *   regardless of how fields are visually grouped into sections.
 * - `spreadsheetColumn` is the column letter in the `Employees` sheet of
 *   the Google Spreadsheet database (Employee Database).
 * - `label` preserves the original Excel header text verbatim — the source
 *   file's "POTITION" typo was fixed to "POSITION" per HR request.
 */

export type EmployeeFieldType =
  | "text"
  | "textarea"
  | "date"
  | "select"
  | "auto";

export interface EmployeeField {
  /** TypeScript-safe camelCase key (never contains spaces/parentheses). */
  key: string;
  /** Original label from db_mod.xlsx, shown verbatim in the UI. */
  label: string;
  type: EmployeeFieldType;
  required: boolean;
  /** Keyboard tab order — identical to db_mod.xlsx column order. */
  tabOrder: number;
  /** Visual grouping only. Never affects tab order. */
  section: EmployeeSection;
  /** Column letter in the `Employees` Google Sheet. */
  spreadsheetColumn: string;
  /** True for system-calculated / non-editable fields (SN, AGE, MASA KERJA). */
  readOnly?: boolean;
  /**
 * True to remove this field from the Employee Form entirely (not rendered,
   * not required). The field stays in this array — and keeps its
   * `spreadsheetColumn` letter — so every other field's positional index
   * into the Google Sheets row stays exactly where it already is.
   */
  hidden?: boolean;
  /** Key into DROPDOWN_OPTIONS (config/dropdown-options.ts) for type "select". */
  optionsKey?: string;
  /** Placeholder text shown in the input. */
  placeholder?: string;
}

export const EMPLOYEE_SECTIONS = [
  "Personal Information",
  "Employment Information",
  "Contract Information",
  "Tax Information",
  "Bank Information",
  "BPJS Information",
  "Family Information",
  "Address & Contact",
  "Other Information",
] as const;

export type EmployeeSection = (typeof EMPLOYEE_SECTIONS)[number];

export const EMPLOYEE_FIELDS: EmployeeField[] = [
  { key: "sn", label: "SN", type: "auto", required: false, tabOrder: 1, section: "Other Information", spreadsheetColumn: "A", readOnly: true },
  { key: "category", label: "CATEGORY", type: "select", required: false, tabOrder: 2, section: "Employment Information", spreadsheetColumn: "B", optionsKey: "category" },
  { key: "fingerCode", label: "FINGER CODE", type: "text", required: true, tabOrder: 3, section: "Employment Information", spreadsheetColumn: "C" },
  { key: "nik", label: "NIK (EMPLOYEE ID)", type: "text", required: true, tabOrder: 4, section: "Personal Information", spreadsheetColumn: "D" },
  { key: "name", label: "NAME", type: "text", required: true, tabOrder: 5, section: "Personal Information", spreadsheetColumn: "E" },
  { key: "department", label: "DEPARTMENT", type: "select", required: true, tabOrder: 6, section: "Employment Information", spreadsheetColumn: "F", optionsKey: "department" },
  { key: "position", label: "POSITION", type: "select", required: true, tabOrder: 7, section: "Employment Information", spreadsheetColumn: "G", optionsKey: "position" },
  { key: "level", label: "LEVEL", type: "select", required: false, tabOrder: 8, section: "Employment Information", spreadsheetColumn: "H", optionsKey: "level" },
  { key: "skill", label: "SKILL", type: "select", required: false, tabOrder: 9, section: "Employment Information", spreadsheetColumn: "I", optionsKey: "skill" },
  { key: "type", label: "Type", type: "select", required: false, tabOrder: 10, section: "Employment Information", spreadsheetColumn: "J", optionsKey: "type" },
  { key: "shed", label: "Shed", type: "select", required: false, tabOrder: 11, section: "Employment Information", spreadsheetColumn: "K", optionsKey: "shed" },
  { key: "ktpNo", label: "KTP NO. (ID NO.)", type: "text", required: true, tabOrder: 12, section: "Personal Information", spreadsheetColumn: "L" },
  { key: "birthDate", label: "BIRTH DATE", type: "date", required: false, tabOrder: 13, section: "Personal Information", spreadsheetColumn: "M" },
  { key: "birthPlace", label: "BIRTH PLACE", type: "text", required: false, tabOrder: 14, section: "Personal Information", spreadsheetColumn: "N" },
  { key: "age", label: "AGE", type: "auto", required: false, tabOrder: 15, section: "Personal Information", spreadsheetColumn: "O", readOnly: true },
  { key: "joinDate", label: "JOIN DATE", type: "date", required: true, tabOrder: 16, section: "Employment Information", spreadsheetColumn: "P" },
  { key: "contractStatus", label: "CONTRACT STATUS", type: "select", required: false, tabOrder: 17, section: "Contract Information", spreadsheetColumn: "Q", optionsKey: "contractStatus" },
  { key: "contractCloseFirst", label: "CONTRACT CLOSE-FIRST", type: "date", required: false, tabOrder: 18, section: "Contract Information", spreadsheetColumn: "R", hidden: true },
  { key: "contractCloseSecond", label: "CONTRACT CLOSE-SECOND", type: "date", required: false, tabOrder: 19, section: "Contract Information", spreadsheetColumn: "S", hidden: true },
  { key: "contractCloseThird", label: "CONTRACT CLOSE-THIRD", type: "date", required: false, tabOrder: 20, section: "Contract Information", spreadsheetColumn: "T", hidden: true },
  { key: "contractCloseFourth", label: "CONTRACT CLOSE-FOURTH", type: "date", required: false, tabOrder: 21, section: "Contract Information", spreadsheetColumn: "U", hidden: true },
  { key: "contractCloseFiveth", label: "CONTRACT CLOSE-FIVETH", type: "date", required: false, tabOrder: 22, section: "Contract Information", spreadsheetColumn: "V", hidden: true },
  { key: "permanenDate", label: "PERMANEN DATE", type: "date", required: false, tabOrder: 23, section: "Contract Information", spreadsheetColumn: "W" },
  { key: "contractCriteria", label: "CONTRACT CRITERIA", type: "select", required: false, tabOrder: 24, section: "Contract Information", spreadsheetColumn: "X", optionsKey: "contractCriteria" },
  { key: "maritalStatus", label: "MARITAL STATUS", type: "select", required: false, tabOrder: 25, section: "Personal Information", spreadsheetColumn: "Y", optionsKey: "maritalStatus" },
  { key: "gender", label: "GENDER", type: "select", required: false, tabOrder: 26, section: "Personal Information", spreadsheetColumn: "Z", optionsKey: "gender" },
  { key: "ptkpStatus", label: "PTKP (STATUS)", type: "select", required: false, tabOrder: 27, section: "Tax Information", spreadsheetColumn: "AA", optionsKey: "ptkpStatus" },
  { key: "ptkpTaxStatus", label: "PTKP PAJAK (TAX STATUS)", type: "select", required: false, tabOrder: 28, section: "Tax Information", spreadsheetColumn: "AB", optionsKey: "ptkpTaxStatus" },
  { key: "npwp", label: "NPWP (TAX ID)", type: "text", required: false, tabOrder: 29, section: "Tax Information", spreadsheetColumn: "AC" },
  { key: "bankName", label: "BANK NAME", type: "select", required: false, tabOrder: 30, section: "Bank Information", spreadsheetColumn: "AD", optionsKey: "bankName" },
  { key: "rekeningNo", label: "REKENING NO. (BANK ACCOUNT NO.)", type: "text", required: false, tabOrder: 31, section: "Bank Information", spreadsheetColumn: "AE" },
  { key: "bpjsKetenagakerjaanNumber", label: "BPJS KETENAGAKERJAAN NUMBER", type: "text", required: false, tabOrder: 32, section: "BPJS Information", spreadsheetColumn: "AF" },
  { key: "bpjsKesehatanNumber", label: "BPJS KESEHATAN NUMBER", type: "text", required: false, tabOrder: 33, section: "BPJS Information", spreadsheetColumn: "AG" },
  { key: "education", label: "EDUCATION", type: "select", required: false, tabOrder: 34, section: "Other Information", spreadsheetColumn: "AH", optionsKey: "education" },
  { key: "religion", label: "RELIGION", type: "select", required: false, tabOrder: 35, section: "Other Information", spreadsheetColumn: "AI", optionsKey: "religion" },
  { key: "address", label: "ADDRESS", type: "textarea", required: false, tabOrder: 36, section: "Address & Contact", spreadsheetColumn: "AJ" },
  { key: "districtCity", label: "KABUPATEN / KOTA (DISTRICT / CITY)", type: "text", required: false, tabOrder: 37, section: "Address & Contact", spreadsheetColumn: "AK" },
  { key: "postalCode", label: "KODE POS (POSTAL CODE)", type: "text", required: false, tabOrder: 38, section: "Address & Contact", spreadsheetColumn: "AL" },
  { key: "hpNumber", label: "HP NUMBER", type: "text", required: false, tabOrder: 39, section: "Address & Contact", spreadsheetColumn: "AM" },
  { key: "kkNo", label: "KK NO. (FAMILY CARD NO.)", type: "text", required: false, tabOrder: 40, section: "Family Information", spreadsheetColumn: "AN" },
  { key: "spouseName", label: "SPOUSE NAME", type: "text", required: false, tabOrder: 41, section: "Family Information", spreadsheetColumn: "AO" },
  { key: "childNameFirst", label: "CHILD NAME - FIRST", type: "text", required: false, tabOrder: 42, section: "Family Information", spreadsheetColumn: "AP" },
  { key: "childNameSecond", label: "CHILD NAME - SECOND", type: "text", required: false, tabOrder: 43, section: "Family Information", spreadsheetColumn: "AQ" },
  { key: "childNameThird", label: "CHILD NAME - THIRD", type: "text", required: false, tabOrder: 44, section: "Family Information", spreadsheetColumn: "AR" },
  { key: "motherName", label: "MOTHER NAME", type: "text", required: false, tabOrder: 45, section: "Family Information", spreadsheetColumn: "AS" },
  { key: "status", label: "STATUS", type: "select", required: false, tabOrder: 46, section: "Employment Information", spreadsheetColumn: "AT", optionsKey: "status" },
  { key: "exitDate", label: "EXIT DATE", type: "date", required: false, tabOrder: 47, section: "Employment Information", spreadsheetColumn: "AU" },
  { key: "reason", label: "REASON", type: "text", required: false, tabOrder: 48, section: "Employment Information", spreadsheetColumn: "AV" },
  { key: "bpjsKtk", label: "BPJS KTK", type: "date", required: false, tabOrder: 49, section: "BPJS Information", spreadsheetColumn: "AW" },
  { key: "bpjsKes", label: "BPJS KES", type: "date", required: false, tabOrder: 50, section: "BPJS Information", spreadsheetColumn: "AX" },
  { key: "seragam", label: "SERAGAM", type: "select", required: false, tabOrder: 51, section: "Other Information", spreadsheetColumn: "AY", optionsKey: "seragam", hidden: true },
  { key: "masaKerja", label: "MASA KERJA", type: "auto", required: false, tabOrder: 52, section: "Employment Information", spreadsheetColumn: "AZ", readOnly: true },
  { key: "mutasiI", label: "MUTASI I", type: "text", required: false, tabOrder: 53, section: "Other Information", spreadsheetColumn: "BA" },
  { key: "mutasiII", label: "MUTASI II", type: "text", required: false, tabOrder: 54, section: "Other Information", spreadsheetColumn: "BB" },
  { key: "detailDisabilitas", label: "DETAIL DISABILITAS", type: "text", required: false, tabOrder: 55, section: "Other Information", spreadsheetColumn: "BC" },
];

/**
 * System fields appended after the 55 original db_mod.xlsx fields.
 * These do NOT alter the original 55-field structure in any way.
 */
export interface SystemField {
  key: string;
  label: string;
  spreadsheetColumn: string;
}

export const SYSTEM_FIELDS: SystemField[] = [
  { key: "recordId", label: "RECORD_ID", spreadsheetColumn: "BD" },
  { key: "createdAt", label: "CREATED_AT", spreadsheetColumn: "BE" },
  { key: "updatedAt", label: "UPDATED_AT", spreadsheetColumn: "BF" },
];

/**
 * Fields added AFTER the original 55 + 3 system fields (business request,
 * post-STEP-3). Appended at the very end — after RECORD_ID/CREATED_AT/
 * UPDATED_AT, not inserted among the original 55 — so every existing
 * Google Sheets row/column position and every existing SQLite column stays
 * exactly where it already is. Visually they still render inside their
 * natural section (Personal Information / Bank Information) via
 * `getFieldsBySection`, which considers these too.
 */
export const EXTRA_EMPLOYEE_FIELDS: EmployeeField[] = [
  { key: "blood", label: "BLOOD TYPE", type: "select", required: false, tabOrder: 56, section: "Personal Information", spreadsheetColumn: "BG", optionsKey: "blood" },
  { key: "email", label: "EMAIL", type: "text", required: false, tabOrder: 57, section: "Personal Information", spreadsheetColumn: "BH" },
  { key: "branch", label: "BRANCH", type: "text", required: false, tabOrder: 58, section: "Bank Information", spreadsheetColumn: "BI" },
  { key: "positionApplied", label: "POSITION APPLIED", type: "select", required: true, tabOrder: 59, section: "Employment Information", spreadsheetColumn: "BJ", optionsKey: "positionApplied" },
  { key: "interviewEvaluation", label: "INTERVIEW EVALUATION", type: "textarea", required: false, tabOrder: 60, section: "Employment Information", spreadsheetColumn: "BK" },
];

/** Every field that appears on the Employee Form: the 55 db_mod.xlsx fields + the extra fields above. */
export const ALL_EMPLOYEE_FORM_FIELDS: EmployeeField[] = [...EMPLOYEE_FIELDS, ...EXTRA_EMPLOYEE_FIELDS];

/** Full header row written to the `Employees` sheet, in column order (A..BI). */
export const EMPLOYEES_SHEET_HEADERS: string[] = [
  ...EMPLOYEE_FIELDS.map((f) => f.label),
  ...SYSTEM_FIELDS.map((f) => f.label),
  ...EXTRA_EMPLOYEE_FIELDS.map((f) => f.label),
];

export const EMPLOYEES_SHEET_NAME = "Employees";

/** Total number of columns used in the Employees sheet (55 + 3 + 3). */
export const EMPLOYEES_LAST_COLUMN = EXTRA_EMPLOYEE_FIELDS[EXTRA_EMPLOYEE_FIELDS.length - 1].spreadsheetColumn;

export function getFieldsBySection(section: EmployeeSection): EmployeeField[] {
  return ALL_EMPLOYEE_FORM_FIELDS.filter((f) => f.section === section && !f.hidden).sort(
    (a, b) => a.tabOrder - b.tabOrder,
  );
}

export function getFieldByKey(key: string): EmployeeField | undefined {
  return ALL_EMPLOYEE_FORM_FIELDS.find((f) => f.key === key);
}

/**
 * Fields hidden from the public apply/walk-in self-registration forms are
 * internal identifiers, HR-managed dates/status details, and internal
 * record-keeping fields. Fields backed by Master Data remain available as
 * dropdowns so applicants can choose from the configured options.
 *
 * NIK/DEPARTMENT/POSITION/JOIN DATE are normally required —
 * `publicApplySchema` (see schemas/employee.schema.ts) relaxes these fields
 * for public forms where HR may complete them later. `approveOnlineRegistration`
 * requires them again before a registration can become a real employee, so
 * HR fills them in at review time, not the candidate.
 */
export const PUBLIC_APPLY_EXCLUDED_FIELDS = [
  "nik",
  "fingerCode",
  "category",
  "department",
  "level",
  "skill",
  "type",
  "shed",
  "status",
  "bankName",
  "rekeningNo",
  "branch",
  "bpjsKtk",
  "bpjsKes",
  "joinDate",
  "permanenDate",
  "exitDate",
  "reason",
  "masaKerja",
  "sn",
  "mutasiI",
  "mutasiII",
  "detailDisabilitas",
  "interviewEvaluation",
];

/**
 * Section display order for the public apply/walk-in forms. Fields backed by
 * Master Data remain visible and are rendered as dropdowns; internal/system
 * fields are removed by PUBLIC_APPLY_EXCLUDED_FIELDS above.
 */
export const PUBLIC_APPLY_SECTION_ORDER: EmployeeSection[] = [
  "Personal Information",
  "Employment Information",
  "Address & Contact",
  "Family Information",
  "Bank Information",
  "BPJS Information",
  "Tax Information",
  "Other Information",
];
