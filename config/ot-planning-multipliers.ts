/**
 * OT Planning "Duration & Paid Hours" reference seed.
 *
 * Each entry is [duration, regularPaidHours, nationalHolidayPaidHours]:
 *  - regularPaidHours: the pay multiplier used for every OT row whose kategori
 *    is NOT "Hari Libur Pemerintah". Existing rows keep their original values;
 *    the extra rows that only the holiday bracket needs (10.5, 13.5..18) use
 *    1.5 + 2*(d-1), i.e. the same value the fallback formula already produced,
 *    so the regular bracket is unchanged by adding them.
 *  - nationalHolidayPaidHours: used only when kategori === "Hari Libur
 *    Pemerintah". 0 means "no holiday rate defined for this duration" — the
 *    holiday path treats that as zero pay, it does NOT fall back to the
 *    regular formula.
 *
 * Shared by postgres-init.ts / sqlite-init.ts (schema seed + idempotent
 * backfill) and ot-planning-service.ts (the empty-table fallback).
 */
export const OT_DURATION_MULTIPLIER_SEED: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.75, 0],
  [1, 1.5, 0],
  [1.5, 2.5, 0],
  [2, 3.5, 4],
  [2.5, 4.5, 0],
  [3, 5.5, 0],
  [3.5, 6.5, 7],
  [4, 7.5, 8],
  [4.5, 8.5, 9],
  [5, 9.5, 10],
  [5.5, 10.5, 11],
  [6, 11.5, 12],
  [6.5, 12.5, 0],
  [7, 13.5, 14],
  [7.5, 14.5, 15],
  [8, 15.5, 16],
  [8.5, 16.5, 17.5],
  [9, 17.5, 19],
  [9.5, 18.5, 21],
  [10, 19.5, 23],
  [10.5, 20.5, 25],
  [11, 21.5, 27],
  [11.5, 22.5, 29],
  [12, 22.5, 31],
  [12.5, 24.5, 33],
  [13, 23.5, 35],
  [13.5, 26.5, 37],
  [14, 27.5, 39],
  [14.5, 28.5, 41],
  [15, 29.5, 43],
  [15.5, 30.5, 45],
  [16, 31.5, 47],
  [16.5, 32.5, 49],
  [17, 33.5, 51],
  [17.5, 34.5, 53],
  [18, 35.5, 0],
];
