/**
 * FINGER CODE auto-generation. Format: YYMM + a 4-digit running number.
 *   YY   = 2-digit join year
 *   MM   = 2-digit join month
 *   NNNN = global running number, zero-padded to 4 digits — keeps
 *          incrementing forever across every employee regardless of their
 *          join year/month (never resets per year or per month).
 *
 * Read-only in the UI (like AGE/MASA KERJA), but unlike those it is NOT
 * recomputed live — it's generated once at CREATE time and then persisted,
 * since it depends on a running counter, not a pure function of the
 * employee's own fields.
 */

function extractRunningNumber(code: string): number {
  const last4 = code.slice(-4);
  const n = parseInt(last4, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Next global running number, given every FINGER CODE already in the database (any year/month). */
export function nextFingerCodeRunningNumber(existingFingerCodes: (string | undefined | null)[]): number {
  let max = 0;
  for (const code of existingFingerCodes) {
    if (!code) continue;
    const n = extractRunningNumber(code);
    if (n > max) max = n;
  }
  return max + 1;
}

/** Builds the FINGER CODE string for a given JOIN DATE and running number. */
export function buildFingerCode(joinDate: string, runningNumber: number): string {
  const d = new Date(joinDate);
  const yy = Number.isNaN(d.getTime()) ? "00" : String(d.getFullYear()).slice(-2);
  const mm = Number.isNaN(d.getTime()) ? "00" : String(d.getMonth() + 1).padStart(2, "0");
  const nnnn = String(runningNumber).padStart(4, "0");
  return `${yy}${mm}${nnnn}`;
}

/** Convenience: builds the next FINGER CODE directly from existing codes + the new employee's join date. */
export function generateFingerCode(joinDate: string, existingFingerCodes: (string | undefined | null)[]): string {
  return buildFingerCode(joinDate, nextFingerCodeRunningNumber(existingFingerCodes));
}
