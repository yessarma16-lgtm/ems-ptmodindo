import { describe, it, expect } from "vitest";

import { analysisRemark } from "@/lib/ot-planning-export";

const durations = [0.5, 1, 1.5, 2];

describe("analysisRemark (CK Analisa)", () => {
  it("actual > 0 & estimasi 0 -> 'without prior estimation', per durasi, joined with '; '", () => {
    const row = { cells: [
      { duration: 0.5, estimated: 0, actual: 1 },
      { duration: 2, estimated: 0, actual: 4 },
    ] };
    expect(analysisRemark(row, durations)).toBe(
      "1 employee worked 0.5 hours of overtime without prior estimation; 4 employees worked 2 hours of overtime without prior estimation",
    );
  });

  it("actual > estimasi > 0 -> 'compared to the initial estimate of N employees'", () => {
    const row = { cells: [{ duration: 1.5, estimated: 4, actual: 6 }] };
    expect(analysisRemark(row, durations)).toBe(
      "6 employees worked 1.5 hours of overtime, compared to the initial estimate of 4 employees",
    );
  });

  it("singular '1 hour' untuk durasi 1 jam", () => {
    const row = { cells: [{ duration: 1, estimated: 0, actual: 1 }] };
    expect(analysisRemark(row, durations)).toBe("1 employee worked 1 hour of overtime without prior estimation");
  });

  it("actual < estimasi -> kosong", () => {
    expect(analysisRemark({ cells: [{ duration: 1, estimated: 5, actual: 2 }] }, durations)).toBe("");
  });

  it("estimasi > 0 tapi actual 0 -> kosong", () => {
    expect(analysisRemark({ cells: [{ duration: 2, estimated: 3, actual: 0 }] }, durations)).toBe("");
  });

  it("actual == estimasi -> kosong", () => {
    expect(analysisRemark({ cells: [{ duration: 2, estimated: 2, actual: 2 }] }, durations)).toBe("");
  });
});
