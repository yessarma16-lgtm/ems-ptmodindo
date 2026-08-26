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

/** One sequential span in a CONTRACT CRITERIA rule — see ContractPeriodRule in lib/database/types.ts. */
export interface ContractPeriodRuleLike {
  value: number;
  unit: "month" | "year";
}

export interface ContractPeriodDates {
  startDate: string;
  endDate: string;
}

/**
 * Walks a CONTRACT CRITERIA's periods sequentially from JOIN DATE, returning
 * one { startDate, endDate } per period: period 1 starts at JOIN DATE and
 * ends at JOIN DATE + periods[0] (→ CONTRACT CLOSE-FIRST); period 2 (if any)
 * starts the next day and ends periods[1] later (→ CONTRACT CLOSE-SECOND);
 * and so on. Mirrors calculateProbationEndDate's "− 1 day" convention (each
 * close date is the day before the next period starts). Returns [] if
 * joinDate is blank/unparseable or periods is empty.
 */
export function calculateContractPeriodDates(joinDate: string, periods: ContractPeriodRuleLike[]): ContractPeriodDates[] {
  const start = parseUtcDate(joinDate);
  if (!start || periods.length === 0) return [];

  const results: ContractPeriodDates[] = [];
  let cursor = new Date(start.getTime());
  for (const period of periods) {
    const periodStart = toIso(cursor);
    const next = new Date(cursor.getTime());
    if (period.unit === "year") next.setUTCFullYear(next.getUTCFullYear() + period.value);
    else next.setUTCMonth(next.getUTCMonth() + period.value);
    const close = new Date(next.getTime());
    close.setUTCDate(close.getUTCDate() - 1);
    results.push({ startDate: periodStart, endDate: toIso(close) });
    cursor = next;
  }
  return results;
}
