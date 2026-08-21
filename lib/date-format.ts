/**
 * All dates in this app are displayed dd-mm-yyyy (not the browser/OS locale
 * default). Stored values are plain "YYYY-MM-DD" (from <input type="date">
 * and Google Sheets/SQLite) or a fuller ISO datetime (createdAt/updatedAt) —
 * matched directly off the string so a date-only value never shifts a day
 * from timezone conversion via `new Date(...)`.
 */
export function formatDateDMY(value?: string | null): string {
  if (!value) return "";
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}-${m}-${y}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${parsed.getFullYear()}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "20 June 2026" style — used on the public apply Thank You page. */
export function formatDateLong(value?: string | null): string {
  if (!value) return "";
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const monthName = MONTH_NAMES[parseInt(m, 10) - 1] ?? m;
    return `${parseInt(d, 10)} ${monthName} ${y}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getDate()} ${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

export function formatTimeHM(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
