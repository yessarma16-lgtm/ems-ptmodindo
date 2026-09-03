import { NextRequest, NextResponse } from "next/server";

import { userAccessUpdateSchema } from "@/schemas/user-access.schema";
import { getUserById, setUserPermissionsOverride } from "@/lib/user-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { isDeveloperUser } from "@/lib/auth/developer-access";
import { ModulePermissionError } from "@/lib/module-permission";
import { FULL_ACCESS_ROLE } from "@/config/user-roles";

/** Saves a user's Individual Access override (partial module→level map). Empty map clears the override. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    if (!isDeveloperUser(await getCurrentSessionUser())) throw new ModulePermissionError("userManagement");
    const { userId } = await params;

    const target = await getUserById(userId);
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (target.role === FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: `${FULL_ACCESS_ROLE} selalu akses penuh — tidak bisa diatur per user.` }, { status: 400 });
    }

    const body = await request.json();
    const parsed = userAccessUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await setUserPermissionsOverride(userId, parsed.data.permissions);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
