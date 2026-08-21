import { describe, it, expect } from "vitest";

import { calculateOvertime } from "@/lib/attendance/overtime-rules";
import type { BracketLookupFn } from "@/lib/attendance/bracket-table";

/**
 * 4 test case wajib dari data real (docs/ATTENDANCE_OVERTIME_MODULE_SPEC.md)
 * — regression test pengaman kalau rule berubah lagi. Tidak satu pun dari
 * 4 case ini seharusnya memanggil lookupBracket (3 kasus "Hari Libur/Lembur"
 * pakai rumus khusus, 1 kasus "selisih <= 0" return 0 lebih dulu) — dicek
 * lewat lookupBracket yang throw kalau sampai terpanggil.
 */
const lookupBracketShouldNotBeCalled: BracketLookupFn = () => {
  throw new Error("lookupBracket should not be called for this case");
};

describe("calculateOvertime", () => {
  it("Laily, Minggu, Hari Libur/Lembur — IT1 lebih telat dari InTime, working hour > 4 jam", async () => {
    const hasil = await calculateOvertime(
      {
        intime: "07:30",
        it1: "08:17",
        outtime: "15:30",
        ot1: "15:30",
        tanggal: "2026-08-09",
        kategori: "Hari Libur/Lembur",
      },
      lookupBracketShouldNotBeCalled,
    );
    expect(hasil).toBe(6.0);
  });

  it("Kholib, Sabtu, Hari Libur/Lembur — kategori Hari Libur/Lembur jatuh di hari Sabtu, bukan Minggu", async () => {
    const hasil = await calculateOvertime(
      {
        intime: "07:30",
        it1: "07:32",
        outtime: "14:30",
        ot1: "14:32",
        tanggal: "2026-08-01",
        kategori: "Hari Libur/Lembur",
      },
      lookupBracketShouldNotBeCalled,
    );
    expect(hasil).toBe(6.0);
  });

  it("Puji, batas 4 jam — 4:03 dibulatkan jadi 4.0, karena TIDAK > 4, tidak dipotong break", async () => {
    const hasil = await calculateOvertime(
      {
        intime: "07:30",
        it1: "07:20",
        outtime: "11:30",
        ot1: "11:33",
        tanggal: "2026-08-09",
        kategori: "Hari Libur/Lembur",
      },
      lookupBracketShouldNotBeCalled,
    );
    expect(hasil).toBe(4.0);
  });

  it("Normal, pulang tepat waktu — OT1 == OutTime, harus 0 jam overtime", async () => {
    const hasil = await calculateOvertime(
      {
        intime: "07:30",
        it1: "07:20",
        outtime: "15:30",
        ot1: "15:30",
        tanggal: "2026-08-06", // Kamis
        kategori: "Normal",
      },
      lookupBracketShouldNotBeCalled,
    );
    expect(hasil).toBe(0.0);
  });
});
