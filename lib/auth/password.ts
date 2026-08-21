import "server-only";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export { DEFAULT_PASSWORD } from "@/config/auth-defaults";

/**
 * Password hashing (Node's built-in `scrypt` — no extra dependency, same
 * philosophy as using `node:sqlite` elsewhere in this project). Node-only:
 * never import this from middleware (Edge runtime), only from API routes.
 */

const KEY_LENGTH = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!hash || !salt) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
