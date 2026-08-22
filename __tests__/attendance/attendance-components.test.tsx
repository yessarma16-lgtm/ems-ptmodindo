import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceImportPanel } from "@/components/attendance/AttendanceImportPanel";
import { BracketMasterManager } from "@/components/attendance/BracketMasterManager";
import { CalculationPanel } from "@/components/attendance/CalculationPanel";
import { AttendanceReportPanel } from "@/components/attendance/AttendanceReportPanel";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("attendance components", () => {
  it("mengirim keputusan konflik Timpa Semua ke endpoint commit", async () => {
    const preview = {
      sourceFilename: "konflik.xlsx",
      validRows: [],
      conflicts: [
        {
          rowNumber: 2,
          key: "1001|2026-08-10",
          existing: { id: 7, nik: "1001", nama: "Lama", tanggal: "2026-08-10", department: "CUTTING", intime: "07:30", outtime: "15:30", it1: "07:30", ot1: "15:30", whour: 8, bhour: 1, othourRecorded: 0, kategori: "Normal" },
          incoming: { nik: "1001", nama: "Baru", tanggal: "2026-08-10", department: "CUTTING", intime: "08:00", outtime: "16:00", it1: "08:00", ot1: "16:00", whour: 8, bhour: 1, othourRecorded: 0, kategori: "Normal" },
        },
      ],
      rejected: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ preview }))
      .mockResolvedValueOnce(response({ summary: { inserted: 1, skipped: 0, rejected: 0, conflicts: [] } }));
    globalThis.fetch = fetchMock;

    render(<AttendanceImportPanel />);
    const file = new File(["xlsx"], "konflik.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });

    await screen.findByText("1 baris konflik");
    fireEvent.click(screen.getByRole("button", { name: "Timpa Semua" }));
    fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Import/ }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/attendance/import/commit")).toBe(true));
    const commitCall = fetchMock.mock.calls.find(([url]) => url === "/api/attendance/import/commit");
    if (!commitCall) throw new Error("Commit request was not sent.");
    expect(commitCall[0]).toBe("/api/attendance/import/commit");
    expect(JSON.parse(String((commitCall[1] as RequestInit).body))).toMatchObject({
      sourceFilename: "konflik.xlsx",
      decisions: { "1001|2026-08-10": "overwrite" },
    });
  });

  it("menampilkan diff bracket dan data history setelah interaksi user", async () => {
    const rows = [{ id: 1, dayType: "Senin-Jumat", durasiStart: 1, durasiEnd: 2, otHours: 0.5 }];
    const history = [{ id: 10, bracketMasterId: 1, dayType: "Senin-Jumat", durasiStart: 1, durasiEnd: 2, otHours: 0.5, changedBy: "tester", changedAt: "2026-08-20T10:00:00.000Z", changeType: "updated" }];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/history")) return Promise.resolve(response({ history }));
      return Promise.resolve(response({ rows }));
    });
    globalThis.fetch = fetchMock;

    render(<BracketMasterManager />);
    await waitFor(() => expect(screen.getByDisplayValue("1:00")).toBeInTheDocument());
    const otInput = screen.getByDisplayValue("0.5");
    fireEvent.change(otInput, { target: { value: "1" } });
    fireEvent.change(otInput, { target: { value: "1.5" } });
    expect(screen.getByText("Diubah")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lihat riwayat perubahan" }));
    await screen.findByText("tester");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Diubah")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/1–2 jam/)).toHaveLength(2);
  });

  it("menjalankan crosscheck, menolak note kosong, lalu menyimpan koreksi manual", async () => {
    const before = [{ id: 3, rawId: 9, dayType: "Senin-Jumat", bracketUsed: "Bracket Senin-Jumat", systemCalculatedOth: 1, finalOth: 1, status: "Tidak Sesuai", correctedBy: null, correctedAt: null, correctionNote: null, calculatedAt: "2026-08-20T10:00:00.000Z", nik: "1001", nama: "NAMA TEST", department: "CUTTING", tanggal: "2026-08-10" }];
    const after = [{ ...before[0], finalOth: 2, status: "Dikoreksi Manual", correctedBy: "tester", correctionNote: "Persetujuan manager" }];
    let calculationReads = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/attendance/calculation") {
        calculationReads += 1;
        return Promise.resolve(response({ rows: calculationReads >= 3 ? after : before }));
      }
      if (url === "/api/attendance/crosscheck") return Promise.resolve(response({ summary: { processed: 1, sesuai: 0, tidakSesuai: 1, cekManual: 0, tidakBerlaku: 0, preservedManualCorrections: 0 } }));
      if (url === "/api/attendance/calculation/correct") {
        expect(JSON.parse(String(init?.body))).toMatchObject({ id: 3, newValue: 2, note: "Persetujuan manager" });
        return Promise.resolve(response({ ok: true }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    globalThis.fetch = fetchMock;

    render(<CalculationPanel />);
    await screen.findByText("Tidak Sesuai");
    fireEvent.click(screen.getByRole("button", { name: "Jalankan Crosscheck" }));
    fireEvent.change(screen.getByLabelText("Calculate from"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Calculate to"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Process Calculation" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/attendance/crosscheck")).toBe(true));

    const statusCell = screen.getByText("Tidak Sesuai");
    fireEvent.click(statusCell.closest("tr") as HTMLTableRowElement);
    expect(screen.getByRole("button", { name: "Simpan Koreksi" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Final OTH baru"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Correction note wajib diisi"), { target: { value: "Persetujuan manager" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan Koreksi" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/attendance/calculation/correct")).toBe(true));
    await screen.findByText("Dikoreksi Manual");
    expect(screen.getByText("2")).toBeInTheDocument();
  }, 15000);

  it("memicu download report dengan filename periode dari response endpoint", async () => {
    let downloaded = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["xlsx"]), { status: 200, headers: { "Content-Disposition": 'attachment; filename="attendance-employee-2026-08-01_2026-08-31.xlsx"' } }));
    globalThis.fetch = fetchMock;
    render(<AttendanceReportPanel />);
    fireEvent.change(document.getElementById("report-date-from") as HTMLInputElement, { target: { value: "2026-08-01" } });
    fireEvent.change(document.getElementById("report-date-to") as HTMLInputElement, { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: /Rekap per karyawan/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/attendance/report", expect.objectContaining({ method: "POST" }));
    expect(downloaded).toBe("attendance-employee-2026-08-01_2026-08-31.xlsx");
    click.mockRestore();
  });
});
