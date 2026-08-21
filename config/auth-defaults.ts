/**
 * Starting password for the seeded admin and every newly-created account —
 * there's no invite/reset-email flow yet. Plain config (no "server-only"
 * guard) so both the client-side Add User dialog copy and the server-side
 * seeding/creation code can reference the same value without duplicating it.
 */
export const DEFAULT_PASSWORD = "Admin@123";
