import { NextRequest, NextResponse } from "next/server";

import { getPendingMovements, markMovementApplied } from "@/lib/employee-movement-service";
import { updateEmployee } from "@/lib/employee-service";

/**
 * Applies Employee Movement History entries whose Effective Date has
 * arrived: Department/Position on the employee record are updated to the
 * movement's "New" values, then the row is marked `applied`. Scheduled via
 * Vercel Cron (see vercel.json) — runs once daily. Auth: Vercel signs cron
 * requests with `Authorization: Bearer $CRON_SECRET` when that env var is
 * set; without it, any caller could trigger this, so CRON_SECRET must be
 * configured before this route is trusted in production.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const pending = await getPendingMovements(todayIso);

  let appliedCount = 0;
  const errors: { movementId: string; employeeId: string; message: string }[] = [];

  for (const movement of pending) {
    try {
      await updateEmployee(movement.employeeId, {
        department: movement.newDepartment,
        position: movement.newPosition,
      });
      await markMovementApplied(movement.id);
      appliedCount++;
    } catch (err) {
      errors.push({
        movementId: movement.id,
        employeeId: movement.employeeId,
        message: err instanceof Error ? err.message : "Failed to apply movement.",
      });
    }
  }

  return NextResponse.json({ checked: pending.length, appliedCount, errors });
}
