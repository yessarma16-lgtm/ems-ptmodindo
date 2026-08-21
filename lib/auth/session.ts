/**
 * Signed session token — deliberately built on Web Crypto (`crypto.subtle`),
 * not Node's `node:crypto`, so the exact same code runs in both API routes
 * (Node runtime) and `middleware.ts` (Edge runtime). No extra dependency,
 * no sessions table: the token itself carries the user id + expiry, HMAC-
 * signed with SESSION_SECRET so it can't be forged or altered.
 */

export const SESSION_COOKIE = "met_session";
const SESSION_MAX_AGE_REMEMBER_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — "Remember me" checked
const SESSION_MAX_AGE_DEFAULT_MS = 1000 * 60 * 60 * 24; // 1 day — otherwise

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return secret;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sessionMaxAgeMs(rememberMe: boolean): number {
  return rememberMe ? SESSION_MAX_AGE_REMEMBER_MS : SESSION_MAX_AGE_DEFAULT_MS;
}

export async function createSessionToken(userId: string, rememberMe: boolean): Promise<string> {
  const expiresAt = Date.now() + sessionMaxAgeMs(rememberMe);
  const payload = `${userId}.${expiresAt}`;
  const signature = await hmacHex(payload, getSecret());
  return `${payload}.${signature}`;
}

/** Returns the userId if the token is well-formed, correctly signed, and not expired — otherwise null. */
export async function verifySessionToken(token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  let expectedSignature: string;
  try {
    expectedSignature = await hmacHex(`${userId}.${expiresAtStr}`, getSecret());
  } catch {
    return null;
  }
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  return userId;
}

export function sessionCookieOptions(rememberMe: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeMs(rememberMe) / 1000,
  };
}
