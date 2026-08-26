import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { RecordNotFoundError } from "@/lib/database/errors";
import type { EmployeeMovementEntry, EmployeeMovementInput } from "@/lib/database/types";

/**
 * CRUD for the `employee_movement_history` table (Promosi/Demosi/Mutasi +
 * the auto-logged "Permanent" transition) — talks to Postgres directly via
 * the shared Supabase-shaped client (lib/supabase.ts), same pattern as
 * lib/contract-criteria-service.ts. Not routed through the multi-provider
 * DatabaseAdapter interface since this feature is Postgres-only.
 */

type SqlRow = Record<string, unknown>;
const TABLE = "employee_movement_history";

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function rowToEntry(row: SqlRow): EmployeeMovementEntry {
  return {
    id: str(row.record_id),
    employeeId: str(row.employee_id),
    movementType: str(row.movement_type),
    effectiveDate: str(row.effective_date),
    lastDepartment: str(row.last_department),
    lastPosition: str(row.last_position),
    newDepartment: str(row.new_department),
    newPosition: str(row.new_position),
    applied: Boolean(row.applied),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/** Movement history for one employee, oldest first. */
export async function getMovementHistory(employeeId: string): Promise<EmployeeMovementEntry[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select("*")
      .eq("employee_id", employeeId)
      .order("id", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToEntry);
  });
}

export async function createMovementEntry(
  employeeId: string,
  input: EmployeeMovementInput,
): Promise<EmployeeMovementEntry> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        employee_id: employeeId,
        movement_type: input.movementType,
        effective_date: input.effectiveDate,
        last_department: input.lastDepartment,
        last_position: input.lastPosition,
        new_department: input.newDepartment,
        new_position: input.newPosition,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToEntry(data as SqlRow);
  });
}

export async function updateMovementEntry(
  id: string,
  input: EmployeeMovementInput,
): Promise<EmployeeMovementEntry> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from(TABLE)
      .update({
        movement_type: input.movementType,
        effective_date: input.effectiveDate,
        last_department: input.lastDepartment,
        last_position: input.lastPosition,
        new_department: input.newDepartment,
        new_position: input.newPosition,
        applied: false, // dates/targets changed — let the cron re-evaluate whether/when to apply it
        updated_at: new Date().toISOString(),
      })
      .eq("record_id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Employee movement entry", id);
    return rowToEntry(data as SqlRow);
  });
}

/**
 * Every not-yet-applied movement whose Effective Date has arrived (today or
 * earlier) — what app/api/cron/apply-movements applies Department/Position
 * updates for. Ordered by id so, if an employee somehow has two pending
 * movements, they apply in the order they were recorded.
 */
export async function getPendingMovements(todayIso: string): Promise<EmployeeMovementEntry[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select("*")
      .eq("applied", false)
      .lte("effective_date", todayIso)
      .neq("effective_date", "")
      .order("id", { ascending: true });
    if (error) throw error;
    return (data as SqlRow[]).map(rowToEntry);
  });
}

export async function markMovementApplied(id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .update({ applied: true, updated_at: new Date().toISOString() })
      .eq("record_id", id);
    if (error) throw error;
  });
}

export async function deleteMovementEntry(id: string): Promise<void> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from(TABLE).delete().eq("record_id", id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new RecordNotFoundError("Employee movement entry", id);
  });
}

/**
 * Auto-logs the Probation/Contract -> Permanent transition as a movement
 * entry (same Department/Position on both sides — becoming Permanent
 * doesn't change the job, just the contract status), effective on
 * PERMANEN DATE. No-ops if the transition already happened for this
 * employee (checked by movementType, not just "any row exists") or if
 * this call isn't actually a transition INTO Permanent. Returns true when it
 * actually created an entry, so callers (Employee Sync's commit summary) can
 * surface "N employee(s) logged as Permanent" instead of this happening silently.
 */
export async function autoLogPermanentMovement(
  employeeId: string,
  previousContractStatus: string,
  nextContractStatus: string,
  department: string,
  position: string,
  permanenDate: string,
): Promise<boolean> {
  const wasPermanent = previousContractStatus.trim().toLowerCase() === "permanent";
  const isNowPermanent = nextContractStatus.trim().toLowerCase() === "permanent";
  if (wasPermanent || !isNowPermanent || !permanenDate.trim()) return false;

  const existing = await getMovementHistory(employeeId);
  if (existing.some((m) => m.movementType === "Permanent")) return false;

  await createMovementEntry(employeeId, {
    movementType: "Permanent",
    effectiveDate: permanenDate,
    lastDepartment: department,
    lastPosition: position,
    newDepartment: department,
    newPosition: position,
  });
  return true;
}
