import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceImportPanel } from "@/components/attendance/AttendanceImportPanel";
import { BracketMasterManager } from "@/components/attendance/BracketMasterManager";

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
    await waitFor(() => expect(screen.getByDisplayValue("1")).toBeInTheDocument());
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[2], { target: { value: "1" } });
    fireEvent.change(inputs[2], { target: { value: "1.5" } });
    expect(screen.getByText("Diubah")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lihat riwayat perubahan" }));
    await screen.findByText("tester");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Diubah")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/1–2 jam/)).toHaveLength(2);
  });
});
