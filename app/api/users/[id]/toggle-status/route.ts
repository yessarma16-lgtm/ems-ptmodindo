import { NextResponse } from "next/server";

import { toggleUserStatus } from "@/lib/user-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await toggleUserStatus(id);
    return NextResponse.json({ user });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
