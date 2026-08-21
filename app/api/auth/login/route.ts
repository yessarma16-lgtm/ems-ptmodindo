import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUserByUsernameWithCredentials } from "@/lib/user-service";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const user = await getUserByUsernameWithCredentials(parsed.data.username);
  const passwordOk = user ? verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt) : false;
  const activeOk = user ? user.status.toLowerCase() === "active" : false;

  // Same generic message whether the username doesn't exist, the password is
  // wrong, or the account is inactive — never reveal which one it was.
  if (!user || !passwordOk || !activeOk) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const token = await createSessionToken(user.id, parsed.data.rememberMe);
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(parsed.data.rememberMe));
  return res;
}
