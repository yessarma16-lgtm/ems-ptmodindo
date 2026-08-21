import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { getUserByIdWithCredentials, setUserPassword } from "@/lib/user-service";
import { verifyPassword, hashPassword } from "@/lib/auth/password";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const user = await getUserByIdWithCredentials(sessionUser.id);
  if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash, user.passwordSalt)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const { hash, salt } = hashPassword(parsed.data.newPassword);
  await setUserPassword(user.id, hash, salt);
  return NextResponse.json({ ok: true });
}
