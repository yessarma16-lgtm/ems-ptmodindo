import type { AllMasterData, MasterDataItem } from "@/lib/master-data-service";
import { FIELD_MASTER_DATA_SOURCE } from "@/config/field-master-data-map";
import type { EmployeeField } from "@/config/employee-fields";

/**
 * Converts master data (Google Sheets rows) into the {value,label} shape
 * the Employee Form's <Select> controls need. Pure data transformation —
 * no Google Sheets access here, safe to import from client components
 * (the `master-data-service` types above are erased at compile time since
 * they're imported with `import type`).
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface EmployeeFormMasterData {
  departments: SelectOption[];
  positions: SelectOption[];
  levels: SelectOption[];
  skills: SelectOption[];
  banks: SelectOption[];
  vacantPositions: SelectOption[];
  lookup: Record<string, SelectOption[]>;
}

/**
 * NAME is used as the option value (not CODE / ID) so it matches how
 * Employee records already store these fields as plain text — keeps
 * backward compatibility with data created before Master Data existed.
 */
function toOptions(items: MasterDataItem[]): SelectOption[] {
  return items.map((item) => ({ value: item.name, label: item.name }));
}

export function toEmployeeFormMasterData(data: AllMasterData): EmployeeFormMasterData {
  const lookup: Record<string, SelectOption[]> = {};
  for (const [type, items] of Object.entries(data.lookup)) {
    // Master data may come from Sheets/Postgres with inconsistent casing or
    // accidental surrounding spaces in TYPE. Normalize the key once so every
    // public form can reliably find its dropdown options.
    lookup[type.trim().toUpperCase()] = toOptions(items);
  }
  return {
    departments: toOptions(data.departments),
    positions: toOptions(data.positions),
    levels: toOptions(data.levels),
    skills: toOptions(data.skills),
    banks: toOptions(data.banks),
    vacantPositions: toOptions(data.vacantPositions),
    lookup,
  };
}

export function getOptionsForField(
  field: EmployeeField,
  masterData: EmployeeFormMasterData | null,
): SelectOption[] {
  if (!masterData) return [];
  const source = FIELD_MASTER_DATA_SOURCE[field.key];
  if (!source) return [];
  return source.kind === "sheet"
    ? masterData[source.sheet]
    : masterData.lookup[source.type.trim().toUpperCase()] ?? [];
}
