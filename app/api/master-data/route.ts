import { NextResponse } from "next/server";

import { getAllMasterData } from "@/lib/master-data-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Active-only master data for every category (Departments, Positions,
 * Levels, Skills, Banks, Lookup), aggregated in as few Google Sheets
 * requests as possible. This is what the Employee Form uses to populate
 * its dropdowns — never expose Google credentials here.
 */
export async function GET() {
  try {
    const data = await getAllMasterData();
    return NextResponse.json(data);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
