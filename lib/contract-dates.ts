/**
 * All date math here is done in UTC throughout (Date.UTC to construct,
 * the getUTC.../setUTC... methods to manipulate, toISOString to serialize)
 * — never mixing local-time parsing with UTC output. Mixing the two silently shifts the
 * result by a day in any timezone with a non-zero UTC offset (e.g.
 * `new Date(dateStr + "T00:00:00")` parses as LOCAL midnight, but
 * `.toISOString()` renders in UTC — in UTC+7, local midnight is still the
 * previous day in UTC, so every date came out one day too early).
 */
function parseUtcDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Default Probation period end date: Join Date + 3 months − 1 day. Editable afterward, this is only the initial suggestion. */
export function calculateProbationEndDate(joinDate: string): string {
  const d = parseUtcDate(joinDate);
  if (!d) return "";
  d.setUTCMonth(d.getUTCMonth() + 3);
  d.setUTCDate(d.getUTCDate() - 1);
  return toIso(d);
}
