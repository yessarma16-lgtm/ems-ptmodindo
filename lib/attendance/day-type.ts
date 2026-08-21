export type DayType = "Senin-Jumat" | "Sabtu" | "Minggu";

/** Senin-Jumat / Sabtu / Minggu dari tanggal ISO (yyyy-mm-dd). UTC-based supaya tidak bergeser oleh timezone lokal environment. */
export function getDayType(tanggalISO: string): DayType {
  const day = new Date(`${tanggalISO}T00:00:00Z`).getUTCDay(); // 0=Minggu .. 6=Sabtu
  if (day === 0) return "Minggu";
  if (day === 6) return "Sabtu";
  return "Senin-Jumat";
}
