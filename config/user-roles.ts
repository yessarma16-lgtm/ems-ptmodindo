/**
 * Fixed set of roles selectable on a User record (Settings -> User
 * Management). Scaffold only — no permission enforcement is wired to these
 * yet, they are just a label until a real login/access-control system is
 * built.
 */
export const USER_ROLES = ["Administrator", "HR Administrator", "HR Staff", "Viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * This role always resolves to full ("edit") access on every module — its
 * Role Access card is locked, and a per-user Individual Access override can
 * never reduce it. Guarantees at least one role can always reach User
 * Management (no one can lock everyone out).
 */
export const FULL_ACCESS_ROLE: UserRole = "Administrator";
