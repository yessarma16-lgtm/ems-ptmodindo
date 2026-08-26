import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { RecordNotFoundError } from "@/lib/database/errors";
import type {
  ContractCriteriaItem,
  ContractPeriodRule,
  CreateContractCriteriaInput,
  UpdateContractCriteriaInput,
} from "@/lib/database/types";

/**
 * CRUD for the `contract_criteria` table (Settings > Master Data > Contract
 * Criteria) — talks to Postgres directly via the shared Supabase-shaped
 * client (lib/supabase.ts), same pattern as lib/database/postgres-online-registrations.ts.
 * Not routed through the multi-provider DatabaseAdapter interface since this
 * feature is Postgres-only (no SQLite/Google Sheets equivalent).
 */

type SqlRow = Record<string, unknown>;
const TABLE = "contract_criteria";

function rowToItem(row: SqlRow): ContractCriteriaItem {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    periods: Array.isArray(row.periods) ? (row.periods as ContractPeriodRule[]) : [],
    appliesToStatus: String(row.applies_to_status ?? ""),
    status: String(row.status ?? "Active"),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function getContractCriteria(options?: { activeOnly?: boolean }): Promise<ContractCriteriaItem[]> {
  return supabaseGuarded(async () => {
    let q = getSupabaseClient().from(TABLE).select("*").order("sort_order", { ascending: true });
    if (options?.activeOnly) q = q.ilike("status", "active");
    const { data, error } = await q;
    if (error) throw error;
    return (data as SqlRow[]).map(rowToItem);
  });
}

export async function createContractCriteriaItem(input: CreateContractCriteriaInput): Promise<ContractCriteriaItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await client.from(TABLE).select("*", { count: "exact", head: true });
      if (countError) throw countError;
      sortOrder = (count ?? 0) + 1;
    }

    const { data, error } = await client
      .from(TABLE)
      .insert({
        code: input.code,
        name: input.name,
        periods: input.periods,
        applies_to_status: input.appliesToStatus,
        status: "Active",
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToItem(data as SqlRow);
  });
}

export async function updateContractCriteriaItem(
  id: string,
  input: UpdateContractCriteriaInput,
): Promise<ContractCriteriaItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const patch: SqlRow = {};
    if (input.code !== undefined) patch.code = input.code;
    if (input.name !== undefined) patch.name = input.name;
    if (input.periods !== undefined) patch.periods = input.periods;
    if (input.appliesToStatus !== undefined) patch.applies_to_status = input.appliesToStatus;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

    if (Object.keys(patch).length > 0) {
      const { error } = await client.from(TABLE).update(patch).eq("id", id);
      if (error) throw error;
    }

    const { data, error } = await client.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError(TABLE, id);
    return rowToItem(data as SqlRow);
  });
}

export async function toggleContractCriteriaStatus(id: string): Promise<ContractCriteriaItem> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: row, error } = await client.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) throw new RecordNotFoundError(TABLE, id);
    const nextStatus = String((row as SqlRow).status ?? "").toLowerCase() === "active" ? "Inactive" : "Active";
    return updateContractCriteriaItem(id, { status: nextStatus });
  });
}
