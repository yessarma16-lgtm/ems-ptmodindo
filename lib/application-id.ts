/**
 * Cosmetic reference code shown on the Thank You page (e.g.
 * "MOD/HR/2026/0620-A1B2") — there's no separate sequential "application
 * number" tracked anywhere in the system, so this derives a stable, unique
 * code straight from data that already exists: the submission date plus the
 * registration's own record ID.
 */
export function buildApplicationId(recordId: string, submittedAt: string): string {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec((submittedAt || "").trim());
  const year = isoMatch?.[1] ?? "----";
  const monthDay = isoMatch ? `${isoMatch[2]}${isoMatch[3]}` : "----";
  const suffix = recordId.replace(/-/g, "").slice(-4).toUpperCase() || "0000";
  return `MOD/HR/${year}/${monthDay}-${suffix}`;
}
