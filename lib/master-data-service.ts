import "server-only";

import { SIMPLE_MASTER_SHEETS, type SimpleMasterCategory } from "@/config/master-data-sheets";
import { getDatabaseAdapter } from "@/lib/database/database";
import { RecordNotFoundError } from "@/lib/database/errors";
import type {
  MasterDataItem,
  LookupItem,
  CreateMasterDataInput,
  UpdateMasterDataInput,
  CreateLookupInput,
  UpdateLookupInput,
  AllMasterData,
} from "@/lib/database/types";

export type {
  MasterDataItem,
  LookupItem,
  CreateMasterDataInput,
  UpdateMasterDataInput,
  CreateLookupInput,
  UpdateLookupInput,
  AllMasterData,
};

/**
 * Master Data service. Like `employee-service.ts`, this is the only module
 * the UI (API routes) should call for master data — it never talks to
 * SQLite or the Google Sheets API directly, delegating to whichever
 * `DatabaseAdapter` is active (see `lib/database/database.ts`).
 *
 *   UI -> API Route -> Master Data Service (this file) -> DatabaseAdapter -> SQLite | Google Sheets
 */

export class MasterDataNotFoundError extends RecordNotFoundError {
  constructor(category: string, id: string) {
    super(category, id);
    this.name = "MasterDataNotFoundError";
  }
}

export const VALID_MASTER_CATEGORIES = [...Object.keys(SIMPLE_MASTER_SHEETS), "lookup"] as const;
export type MasterCategory = (typeof VALID_MASTER_CATEGORIES)[number];

export function isValidMasterCategory(value: string): value is MasterCategory {
  return (VALID_MASTER_CATEGORIES as readonly string[]).includes(value);
}

export function isSimpleCategory(value: MasterCategory): value is SimpleMasterCategory {
  return value !== "lookup";
}

function rethrowAsMasterDataNotFound(err: unknown, category: string, id: string): never {
  if (err instanceof RecordNotFoundError) throw new MasterDataNotFoundError(category, id);
  throw err;
}

export async function getSimpleMasterData(
  category: SimpleMasterCategory,
  options?: { activeOnly?: boolean },
): Promise<MasterDataItem[]> {
  return getDatabaseAdapter().getSimpleMasterData(category, options);
}

export async function createSimpleMasterDataItem(
  category: SimpleMasterCategory,
  input: CreateMasterDataInput,
): Promise<MasterDataItem> {
  return getDatabaseAdapter().createSimpleMasterDataItem(category, input);
}

export async function updateSimpleMasterDataItem(
  category: SimpleMasterCategory,
  id: string,
  input: UpdateMasterDataInput,
): Promise<MasterDataItem> {
  try {
    return await getDatabaseAdapter().updateSimpleMasterDataItem(category, id, input);
  } catch (err) {
    rethrowAsMasterDataNotFound(err, category, id);
  }
}

export async function toggleSimpleMasterDataStatus(
  category: SimpleMasterCategory,
  id: string,
): Promise<MasterDataItem> {
  try {
    return await getDatabaseAdapter().toggleSimpleMasterDataStatus(category, id);
  } catch (err) {
    rethrowAsMasterDataNotFound(err, category, id);
  }
}

export async function deleteSimpleMasterDataItem(category: SimpleMasterCategory, id: string): Promise<void> {
  try {
    await getDatabaseAdapter().deleteSimpleMasterDataItem(category, id);
  } catch (err) {
    rethrowAsMasterDataNotFound(err, category, id);
  }
}

export async function getLookup(
  type: string,
  options?: { activeOnly?: boolean },
): Promise<LookupItem[]> {
  return getDatabaseAdapter().getLookup(type, options);
}

export async function getAllLookup(): Promise<Record<string, LookupItem[]>> {
  return getDatabaseAdapter().getAllLookup();
}

export async function getAllLookupIncludingInactive(): Promise<Record<string, LookupItem[]>> {
  return getDatabaseAdapter().getAllLookupIncludingInactive();
}

export async function createLookupItem(input: CreateLookupInput): Promise<LookupItem> {
  return getDatabaseAdapter().createLookupItem(input);
}

export async function updateLookupItem(id: string, input: UpdateLookupInput): Promise<LookupItem> {
  try {
    return await getDatabaseAdapter().updateLookupItem(id, input);
  } catch (err) {
    rethrowAsMasterDataNotFound(err, "lookup", id);
  }
}

export async function toggleLookupStatus(id: string): Promise<LookupItem> {
  try {
    return await getDatabaseAdapter().toggleLookupStatus(id);
  } catch (err) {
    rethrowAsMasterDataNotFound(err, "lookup", id);
  }
}

export async function deleteLookupItem(id: string): Promise<void> {
  try {
    await getDatabaseAdapter().deleteLookupItem(id);
  } catch (err) {
    rethrowAsMasterDataNotFound(err, "lookup", id);
  }
}

/** Active-only master data for every category — used by the Employee Form. */
export async function getAllMasterData(): Promise<AllMasterData> {
  return getDatabaseAdapter().getAllMasterData();
}
