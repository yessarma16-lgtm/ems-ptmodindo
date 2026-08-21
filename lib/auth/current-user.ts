import "server-only";
import { cookies } from "next/headers";

import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { getUserById } from "@/lib/user-service";
import type { User } from "@/lib/user-service";

/**
 * Reads the session cookie and resolves the logged-in user — for Server
 * Components and API routes only (uses `next/headers`, Node runtime; the
 * DB lookup pulls in `node:sqlite`). `middleware.ts` verifies the token
 * itself via lib/auth/session.ts directly and never imports this file.
 *
 * Short in-memory cache: this runs on nearly every authenticated page
 * navigation, and under the Google Sheets provider a fresh lookup is a live
 * API round-trip — without this, every page load would feel noticeably
 * slower. 30s TTL: a role/profile change may take up to that long to show
 * up elsewhere for the same user, which is an acceptable trade-off (same
 * idea as any session-cached user object).
 */
const CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: User | null; expiresAt: number }>();

export async function getCurrentSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const user = await getUserById(userId);
  userCache.set(userId, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return user;
}
