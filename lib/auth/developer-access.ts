import type { User } from "@/lib/user-service";

/** The Database and Role Access administration views are reserved for this account. */
export function isDeveloperUser(user: User | null | undefined): boolean {
  return user?.username.trim().toLowerCase() === "developer";
}
