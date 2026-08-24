import type { SimpleMasterCategory, LookupType } from "@/config/master-data-sheets";

/**
 * Maps each `select`-type Employee field (config/employee-fields.ts) to
 * where its options come from in the Google Spreadsheet. Purely additive —
 * does not modify the 55-field structure, labels, order, or tab order.
 */
export type MasterDataSource =
  | { kind: "sheet"; sheet: SimpleMasterCategory }
  | { kind: "lookup"; type: LookupType };

export const FIELD_MASTER_DATA_SOURCE: Record<string, MasterDataSource> = {
  department: { kind: "sheet", sheet: "departments" },
  position: { kind: "sheet", sheet: "positions" },
  positionApplied: { kind: "sheet", sheet: "vacantPositions" },
  level: { kind: "sheet", sheet: "levels" },
  skill: { kind: "sheet", sheet: "skills" },
  bankName: { kind: "sheet", sheet: "banks" },

  category: { kind: "lookup", type: "CATEGORY" },
  type: { kind: "lookup", type: "TYPE" },
  shed: { kind: "lookup", type: "SHED" },
  contractStatus: { kind: "lookup", type: "CONTRACT_STATUS" },
  contractCriteria: { kind: "lookup", type: "CONTRACT_CRITERIA" },
  maritalStatus: { kind: "lookup", type: "MARITAL_STATUS" },
  gender: { kind: "lookup", type: "GENDER" },
  ptkpStatus: { kind: "lookup", type: "PTKP" },
  ptkpTaxStatus: { kind: "lookup", type: "PTKP" },
  education: { kind: "lookup", type: "EDUCATION" },
  religion: { kind: "lookup", type: "RELIGION" },
  status: { kind: "lookup", type: "EMPLOYEE_STATUS" },
  bpjsKtk: { kind: "lookup", type: "BPJS_KTK" },
  bpjsKes: { kind: "lookup", type: "BPJS_KES" },
  seragam: { kind: "lookup", type: "SERAGAM" },
  blood: { kind: "lookup", type: "BLOOD_TYPE" },
};
