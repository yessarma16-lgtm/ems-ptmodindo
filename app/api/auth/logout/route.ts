import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { logActivity } from "@/lib/activity-log";

export async function POST() {
  const user = await getCurrentSessionUser().catch(() => null);
  await logActivity(user?.name, "Logout");
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
