/**
 * TEMPORARY dropdown option data.
 *
 * These lists are placeholders only. Once the Master Data sheets
 * (Departments, Positions, Levels, Skills, Banks, ...) are populated in the
 * Google Spreadsheet, these options must be replaced by data fetched from
 * those sheets. Everything in this file is marked TEMP and safe to remove
 * once real Master Data is wired up.
 */

export interface DropdownOption {
  value: string;
  label: string;
}

/** TEMP — replace with data from the `Departments` sheet. */
const department: DropdownOption[] = [
  "Production", "Quality Control", "Warehouse", "Human Resources",
  "Finance & Accounting", "Engineering", "Maintenance", "Procurement",
  "IT", "Marketing",
].map((v) => ({ value: v, label: v }));

/** TEMP — replace with data from the `Positions` sheet. */
const position: DropdownOption[] = [
  "Staff", "Supervisor", "Team Leader", "Assistant Manager", "Manager",
  "Senior Manager", "Operator", "Technician", "Admin",
].map((v) => ({ value: v, label: v }));

/** TEMP — replace with data from the `Levels` sheet. */
const level: DropdownOption[] = [
  "Entry", "Junior", "Intermediate", "Senior", "Lead", "Managerial",
].map((v) => ({ value: v, label: v }));

/** TEMP — replace with data from the `Skills` sheet. */
const skill: DropdownOption[] = [
  "General", "Welding", "Machining", "Electrical", "Assembly", "QC Inspection",
  "Forklift Operator", "Administration",
].map((v) => ({ value: v, label: v }));

/** TEMP — employment type. */
const type: DropdownOption[] = [
  "Permanent", "Contract", "Probation", "Daily Worker", "Intern",
].map((v) => ({ value: v, label: v }));

/** TEMP — work shift/schedule. */
const shed: DropdownOption[] = [
  "Non-Shift", "Shift 1", "Shift 2", "Shift 3",
].map((v) => ({ value: v, label: v }));

/** TEMP — employee category. */
const category: DropdownOption[] = [
  "Staff", "Non-Staff", "Management",
].map((v) => ({ value: v, label: v }));

const contractStatus: DropdownOption[] = [
  "Active", "First Contract", "Second Contract", "Third Contract",
  "Permanent", "Expired", "Terminated",
].map((v) => ({ value: v, label: v }));

const contractCriteria: DropdownOption[] = [
  "Performance Good", "Performance Average", "Performance Poor", "Under Review",
].map((v) => ({ value: v, label: v }));

const maritalStatus: DropdownOption[] = [
  "Single", "Married", "Divorced", "Widowed",
].map((v) => ({ value: v, label: v }));

const gender: DropdownOption[] = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

/** TEMP — Indonesian PTKP status codes. */
const ptkpStatus: DropdownOption[] = [
  "TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3",
].map((v) => ({ value: v, label: v }));

const ptkpTaxStatus: DropdownOption[] = ptkpStatus;

const bankName: DropdownOption[] = [
  "BCA", "BRI", "BNI", "Mandiri", "CIMB Niaga", "Danamon", "Permata Bank",
].map((v) => ({ value: v, label: v }));

const education: DropdownOption[] = [
  "SD", "SMP", "SMA/SMK", "D3", "S1", "S2", "S3",
].map((v) => ({ value: v, label: v }));

const religion: DropdownOption[] = [
  "Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu",
].map((v) => ({ value: v, label: v }));

const status: DropdownOption[] = [
  "Active", "Inactive", "On Leave", "Resigned", "Terminated",
].map((v) => ({ value: v, label: v }));

const bpjsKtk: DropdownOption[] = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const bpjsKes: DropdownOption[] = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const seragam: DropdownOption[] = [
  "XS", "S", "M", "L", "XL", "XXL",
].map((v) => ({ value: v, label: v }));

export const DROPDOWN_OPTIONS: Record<string, DropdownOption[]> = {
  department, position, level, skill, type, shed, category,
  contractStatus, contractCriteria, maritalStatus, gender,
  ptkpStatus, ptkpTaxStatus, bankName, education, religion, status,
  bpjsKtk, bpjsKes, seragam,
};
