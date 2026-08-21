import { NextRequest, NextResponse } from "next/server";

import { deactivateEmployee } from "@/lib/employee-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * STEP 1 delete policy: soft delete only. Sets STATUS to "Inactive" and
 * stamps EXIT DATE. The row is never permanently removed from the sheet.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const employee = await deactivateEmployee(id);
    return NextResponse.json({ employee });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
