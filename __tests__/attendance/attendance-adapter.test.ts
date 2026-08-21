import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach } from "vitest";

import { ensureSchema } from "@/lib/database/sqlite-init";
import { createSqliteAttendanceAdapter } from "@/lib/database/sqlite-attendance";
import type { RawAttendanceInput, BracketMasterRowInput } from "@/lib/database/attendance-types";

/**
 * Test AttendanceDatabaseAdapter (SQLite) terhadap DB `:memory:` yang
 * dibuat & dibuang ulang tiap test — TIDAK menyentuh data/employee.db asli.
 * `ensureSchema()` dipanggil langsung (sama seperti npm run db:init:sqlite),
 * bukan lewat getSqliteDb() singleton, supaya benar-benar terisolasi.
 */
function makeTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(db);
  return db;
}

function sampleRow(overrides: Partial<RawAttendanceInput> = {}): RawAttendanceInput {
  return {
    nik: "1001",
    nama: "TEST EMPLOYEE",
    department: "CUTTING",
    tanggal: "2026-08-10",
    intime: "07:30",
    outtime: "15:30",
    it1: "07:30",
    ot1: "15:30",
    whour: 8,
    bhour: 1,
    othourRecorded: 0,
    kategori: "Normal",
    importedBy: "tester",
    sourceFilename: "test.xlsx",
    ...overrides,
  };
}

describe("AttendanceDatabaseAdapter (SQLite)", () => {
  let db: DatabaseSync;
  let adapter: ReturnType<typeof createSqliteAttendanceAdapter>;

  beforeEach(() => {
    db = makeTestDb();
    adapter = createSqliteAttendanceAdapter(db);
  });

  it("importRawAttendance menerima array kosong tanpa error", async () => {
    const summary = await adapter.importRawAttendance([]);
    expect(summary).toEqual({ inserted: 0, skipped: 0, rejected: 0, conflicts: [] });
  });

  it("importRawAttendance mendeteksi konflik nik+date yang sudah ada", async () => {
    await adapter.importRawAttendance([sampleRow()]);
    const summary = await adapter.importRawAttendance([sampleRow({ nama: "NAMA BARU" })]);
    expect(summary.inserted).toBe(0);
    expect(summary.conflicts).toHaveLength(1);
    expect(summary.conflicts[0]).toMatchObject({ nik: "1001", tanggal: "2026-08-10" });

    // Mode "ask" (default) tidak menimpa -- data lama tetap.
    const raw = await adapter.getRawAttendance({ nik: "1001" });
    expect(raw[0].nama).toBe("TEST EMPLOYEE");
  });

  it("updateBracketMaster menulis snapshot ke bracket_master_history sebelum update", async () => {
    await adapter.updateBracketMaster(
      [{ dayType: "Senin-Jumat", durasiStart: 0, durasiEnd: 0.5, otHours: 0.5 } as BracketMasterRowInput],
      "admin",
    );
    const [created] = await adapter.getBracketMaster("Senin-Jumat");
    let history = await adapter.getBracketMasterHistory(created.id);
    expect(history).toHaveLength(1);
    expect(history[0].changeType).toBe("created");

    await adapter.updateBracketMaster(
      [{ id: created.id, dayType: "Senin-Jumat", durasiStart: 0, durasiEnd: 0.5, otHours: 1 }],
      "admin2",
    );
    history = await adapter.getBracketMasterHistory(created.id);
    expect(history).toHaveLength(2);
    const updatedEntry = history.find((h) => h.changeType === "updated");
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.otHours).toBe(0.5); // snapshot nilai LAMA (sebelum diubah jadi 1), bukan nilai baru
  });

  it("updateBracketMaster history dan update terjadi dalam satu transaksi (rollback kalau salah satu gagal)", async () => {
    await adapter.updateBracketMaster(
      [{ dayType: "Sabtu", durasiStart: 0, durasiEnd: 1, otHours: 1 }],
      "admin",
    );
    const [existing] = await adapter.getBracketMaster("Sabtu");

    // id yang tidak ada di DB -> updateBracketMaster harus throw, dan TIDAK
    // boleh ada perubahan sebagian (baris valid lain di batch yang sama pun
    // ikut di-rollback).
    await expect(
      adapter.updateBracketMaster(
        [
          { id: existing.id, dayType: "Sabtu", durasiStart: 0, durasiEnd: 1, otHours: 2 }, // valid, harusnya berubah
          { id: 999999, dayType: "Sabtu", durasiStart: 1, durasiEnd: 2, otHours: 1 }, // id tidak ada -> error
        ],
        "admin",
      ),
    ).rejects.toThrow();

    const [afterFailedBatch] = await adapter.getBracketMaster("Sabtu");
    expect(afterFailedBatch.otHours).toBe(1); // tidak berubah jadi 2 -- baris pertama ikut di-rollback
    const history = await adapter.getBracketMasterHistory(existing.id);
    expect(history).toHaveLength(1); // masih cuma "created", tidak ada "updated" yang nyangkut dari batch yang gagal
  });

  it("updateBracketMaster bisa menghapus semua baris dalam satu day_type", async () => {
    await adapter.updateBracketMaster(
      [
        { dayType: "Minggu", durasiStart: 0, durasiEnd: 1, otHours: 1 },
        { dayType: "Minggu", durasiStart: 1, durasiEnd: 2, otHours: 2 },
      ],
      "admin",
    );
    const beforeDelete = await adapter.getBracketMaster("Minggu");
    expect(beforeDelete).toHaveLength(2);

    await adapter.updateBracketMaster([], "admin2", ["Minggu"]);

    const afterDelete = await adapter.getBracketMaster("Minggu");
    expect(afterDelete).toHaveLength(0);
    const history = await adapter.getBracketMasterHistory();
    expect(history.filter((h) => h.dayType === "Minggu" && h.changeType === "deleted")).toHaveLength(2);
  });

  it("runCrosscheck tidak menimpa final_oth yang statusnya Dikoreksi Manual", async () => {
    await adapter.importRawAttendance([sampleRow({ othourRecorded: 0 })]);
    const [raw] = await adapter.getRawAttendance({ nik: "1001" });
    await adapter.runCrosscheck([raw.id]);
    const [calculated] = await adapter.getCalculatedAttendance({});
    await adapter.correctFinalOth(calculated.id, 5, "koreksi manual manager", "manager1");

    await adapter.runCrosscheck([raw.id]);
    const [afterRerun] = await adapter.getCalculatedAttendance({});
    expect(afterRerun.status).toBe("Dikoreksi Manual");
    expect(afterRerun.finalOth).toBe(5); // tidak ditimpa balik ke system_calculated_oth
  });

  it("runCrosscheck bersifat idempotent - dipanggil 2x hasil sama untuk raw_id yang sama", async () => {
    await adapter.importRawAttendance([sampleRow()]);
    const [raw] = await adapter.getRawAttendance({ nik: "1001" });

    await adapter.runCrosscheck([raw.id]);
    const [firstRun] = await adapter.getCalculatedAttendance({});

    await adapter.runCrosscheck([raw.id]);
    const [secondRun] = await adapter.getCalculatedAttendance({});

    expect(secondRun.systemCalculatedOth).toBe(firstRun.systemCalculatedOth);
    expect(secondRun.finalOth).toBe(firstRun.finalOth);
    expect(secondRun.status).toBe(firstRun.status);
  });

  it("ensureSchema() aman dipanggil berkali-kali tanpa error (idempotent) untuk 3 tabel baru ini", () => {
    expect(() => {
      ensureSchema(db);
      ensureSchema(db);
      ensureSchema(db);
    }).not.toThrow();
  });

  it("mencoba hapus raw_attendance yang masih punya calculated_attendance terkait -> ditolak", async () => {
    await adapter.importRawAttendance([sampleRow()]);
    const [raw] = await adapter.getRawAttendance({ nik: "1001" });
    await adapter.runCrosscheck([raw.id]);

    expect(() => db.prepare("DELETE FROM raw_attendance WHERE id = ?").run(raw.id)).toThrow();
  });
});
