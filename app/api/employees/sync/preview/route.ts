import { NextResponse } from "next/server";

import { previewEmployeeSync } from "@/lib/employee-sync";
import { toApiErrorResponse } from "@/lib/api-error";

/** Reads the "Employee Sync" Google Sheet tab and diffs it against the dashboard — pure read, writes nothing. */
export async function POST() {
  try {
    const preview = await previewEmployeeSync();
    return NextResponse.json({ preview });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
