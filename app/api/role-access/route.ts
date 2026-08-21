import { NextResponse } from "next/server";

import { getAllRoleAccess } from "@/lib/role-access-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const roles = await getAllRoleAccess();
    return NextResponse.json({ roles });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
