import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { describe, it, expect, beforeEach } from "vitest";

import { ensureSchema } from "@/lib/database/sqlite-init";
import { createSqliteAttendanceAdapter } from "@/lib/database/sqlite-attendance";
import { WHITELIST_HEADERS } from "@/lib/attendance/importer";
import { previewAttendanceImport, commitAttendanceImport } from "@/lib/attendance-import";

/**
 * Test orkestrasi Tab 1 "Import Data Absensi" (lib/attendance-import.ts:
 * previewAttendanceImport + commitAttendanceImport) terhadap DB `:memory:`
 * terisolasi -- sama seperti attendance-adapter.test.ts.
 *
 * CATATAN: addendum langkah 5 minta "test komponen upload". Project ini
 * belum punya infra test komponen React (tidak ada @testing-library/react
 * atau jsdom environment di mana pun) -- menambahkannya sekarang berarti
 * infra testing baru lagi di luar scope langkah ini. Yang ditest di sini
 * adalah logika yang SEBENARNYA di-exercise oleh AttendanceImportPanel.tsx
 * (preview tanpa tulis DB, lalu commit) lewat service layer-nya langsung --
 * memvalidasi behavior yang sama, tanpa render DOM.
 */

function makeTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(db);
  return db;
}

async function buildWorkbookBuffer(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Data Cross Check NK");
  sheet.addRow([...WHITELIST_HEADERS]);
  for (const row of rows) sheet.addRow(row);
  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  return Buffer.from(buffer);
}

describe("lib/attendance-import.ts", () => {
  let db: DatabaseSync;
  let adapter: ReturnType<typeof createSqliteAttendanceAdapter>;

  beforeEach(() => {
    db = makeTestDb();
    adapter = createSqliteAttendanceAdapter(db);
  });

  it("bisa handle file 0-baris-data (hasil 0 baris diimpor, bukan error)", async () => {
    const buffer = await buildWorkbookBuffer([]); // header-only, sama seperti template kosong yang di-download user
    const preview = await previewAttendanceImport(buffer, "template-kosong.xlsx", adapter);
    expect(preview.validRows).toHaveLength(0);
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.rejected).toHaveLength(0);

    const summary = await commitAttendanceImport([], {}, "tester", "template-kosong.xlsx", adapter);
    expect(summary).toEqual({ inserted: 0, skipped: 0, rejected: 0, conflicts: [] });

    const raw = await adapter.getRawAttendance({});
    expect(raw).toHaveLength(0);
  });

  it("preview konflik muncul sebelum insert benar-benar terjadi (belum ada perubahan DB sebelum konfirmasi)", async () => {
    const firstUpload = await buildWorkbookBuffer([
      [1, "CUTTING", "1001", "NAMA LAMA", "10/08/2026", 5, "07:30", "15:30", "07:30", "15:30", 8, 1, 0, "Normal", ""],
    ]);
    const firstPreview = await previewAttendanceImport(firstUpload, "upload1.xlsx", adapter);
    expect(firstPreview.conflicts).toHaveLength(0);
    await commitAttendanceImport(
      firstPreview.validRows.map((v) => v.input),
      {},
      "tester",
      "upload1.xlsx",
      adapter,
    );
    const afterFirstImport = await adapter.getRawAttendance({});
    expect(afterFirstImport).toHaveLength(1);
    expect(afterFirstImport[0].nama).toBe("NAMA LAMA");

    // Re-upload nik+date yang sama dengan data berbeda.
    const secondUpload = await buildWorkbookBuffer([
      [1, "CUTTING", "1001", "NAMA BARU", "10/08/2026", 5, "08:00", "16:00", "08:00", "16:00", 8, 1, 0, "Normal", ""],
    ]);
    const secondPreview = await previewAttendanceImport(secondUpload, "upload2.xlsx", adapter);

    // Preview mendeteksi konflik dan menampilkan nilai lama vs baru...
    expect(secondPreview.validRows).toHaveLength(0);
    expect(secondPreview.conflicts).toHaveLength(1);
    expect(secondPreview.conflicts[0].existing.nama).toBe("NAMA LAMA");
    expect(secondPreview.conflicts[0].incoming.nama).toBe("NAMA BARU");

    // ...tapi DB belum berubah sama sekali sebelum commit dipanggil.
    const beforeCommit = await adapter.getRawAttendance({});
    expect(beforeCommit).toHaveLength(1);
    expect(beforeCommit[0].nama).toBe("NAMA LAMA");

    // User pilih "Lewati" -- DB tetap tidak berubah setelah commit juga.
    const skipKey = secondPreview.conflicts[0].key;
    const skipSummary = await commitAttendanceImport(
      secondPreview.conflicts.map((c) => c.incoming),
      { [skipKey]: "skip" },
      "tester",
      "upload2.xlsx",
      adapter,
    );
    expect(skipSummary.skipped).toBe(1);
    const afterSkip = await adapter.getRawAttendance({});
    expect(afterSkip[0].nama).toBe("NAMA LAMA");

    // Baru kalau user pilih "Timpa" -- DB berubah.
    const overwriteSummary = await commitAttendanceImport(
      secondPreview.conflicts.map((c) => c.incoming),
      { [skipKey]: "overwrite" },
      "tester",
      "upload2.xlsx",
      adapter,
    );
    expect(overwriteSummary.inserted).toBe(1);
    const afterOverwrite = await adapter.getRawAttendance({});
    expect(afterOverwrite[0].nama).toBe("NAMA BARU");
  });
});
