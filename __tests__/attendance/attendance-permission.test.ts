import { describe, expect, it } from "vitest";

import { hasModuleAccess } from "@/lib/module-permission";

describe("attendance report permission", () => {
  it("menolak role tanpa akses attendanceReport", () => {
    expect(hasModuleAccess("hidden")).toBe(false);
    expect(hasModuleAccess(undefined)).toBe(false);
    expect(hasModuleAccess("view")).toBe(true);
  });
});
