/**
 * Auto-calculated Employee fields (AGE, MASA KERJA).
 * Always computed from the current actual date — never entered manually.
 */

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calculates age in full years from a BIRTH DATE (YYYY-MM-DD). */
export function calculateAge(birthDate: string | undefined | null, asOf: Date = new Date()): number | null {
  const dob = parseDate(birthDate);
  if (!dob) return null;
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/** Calculates length of service ("Masa Kerja") from a JOIN DATE, e.g. "3 Years 4 Months". */
export function calculateMasaKerja(joinDate: string | undefined | null, asOf: Date = new Date()): string | null {
  const start = parseDate(joinDate);
  if (!start) return null;

  let years = asOf.getFullYear() - start.getFullYear();
  let months = asOf.getMonth() - start.getMonth();
  let days = asOf.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;

  const parts: string[] = [];
  parts.push(`${years} Year${years !== 1 ? "s" : ""}`);
  parts.push(`${months} Month${months !== 1 ? "s" : ""}`);
  if (years === 0 && months === 0) {
    parts.push(`${days} Day${days !== 1 ? "s" : ""}`);
  }
  return parts.join(" ");
}
