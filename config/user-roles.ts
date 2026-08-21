/**
 * Fixed set of roles selectable on a User record (Settings -> User
 * Management). Scaffold only — no permission enforcement is wired to these
 * yet, they are just a label until a real login/access-control system is
 * built.
 */
export const USER_ROLES = ["Administrator", "HR Administrator", "HR Staff", "Viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];
