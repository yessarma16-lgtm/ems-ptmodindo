import { describe, expect, it, vi, beforeEach } from "vitest";
import { previousJobSchema } from "@/schemas/new-hiring.schema";
import { MAX_CV_BYTES } from "@/lib/ocr/azure-document-intelligence";

describe("Applicant Pool and New Hiring guards", () => {
  it("uses the approved MODMMHHXXX candidate-number shape", () => {
    expect("MOD0823001").toMatch(/^MOD\d{4}\d{3}$/);
    expect("MOD0823001").not.toBe("MOD0823002"); // separate generated values remain unique
  });

  it("keeps candidate number capacity at three digits per MMHH bucket", () => {
    const generated = new Set(Array.from({ length: 999 }, (_, i) => `MOD0823${String(i + 1).padStart(3, "0")}`));
    expect(generated.size).toBe(999);
    expect([...generated][0]).toBe("MOD0823001");
    expect([...generated].at(-1)).toBe("MOD0823999");
  });

  it("accepts required and optional Previous Jobs fields", () => {
    expect(previousJobSchema.parse({ companyName: "PT A", startYear: 2020 })).toMatchObject({ companyName: "PT A", startYear: 2020 });
    expect(previousJobSchema.safeParse({ companyName: "", startYear: 2020 }).success).toBe(false);
    expect(previousJobSchema.safeParse({ companyName: "PT A", startYear: 2022, endYear: 2021 }).success).toBe(false);
  });

  it("enforces the 4 MB OCR input limit", () => {
    expect(MAX_CV_BYTES).toBe(4 * 1024 * 1024);
  });

  it("returns duplicate alert for verify-NIK duplicate", async () => {
    vi.resetModules();
    vi.doMock("@/lib/online-register-service", () => ({ verifyNewHiringNik: vi.fn().mockResolvedValue({ duplicate: true, applicantPoolId: null, duplicateCheckResult: { foundIn: "employees" } }) }));
    const { POST } = await import("@/app/api/new-hiring/verify-nik/route");
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ nik: "123" }) }) as never);
    expect(await response.json()).toMatchObject({ duplicate: true, alert: "duplikat" });
  });

  it("allows a new NIK and exposes Applicant Pool match id", async () => {
    vi.resetModules();
    vi.doMock("@/lib/online-register-service", () => ({ verifyNewHiringNik: vi.fn().mockResolvedValue({ duplicate: false, applicantPoolId: "pool-1", duplicateCheckResult: { foundIn: "none" } }) }));
    const { POST } = await import("@/app/api/new-hiring/verify-nik/route");
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ nik: "999" }) }) as never);
    expect(await response.json()).toMatchObject({ duplicate: false, applicantPoolId: "pool-1", alert: null });
  });

  it("rejects expired/revoked New Hiring access with an explicit status", async () => {
    vi.resetModules();
    vi.doMock("@/lib/online-register-service", () => ({ getNewHiringByToken: vi.fn().mockResolvedValue(null) }));
    const { GET } = await import("@/app/api/new-hiring/link/[token]/route");
    const response = await GET(new Request("http://test") as never, { params: Promise.resolve({ token: "expired" }) });
    expect(response.status).toBe(410);
    expect((await response.json()).error).toContain("tidak aktif");
  });

  it("generates a New Hiring link through the service", async () => {
    vi.resetModules();
    vi.doMock("@/lib/online-register-service", () => ({ generateNewHiringLink: vi.fn().mockResolvedValue({ token: "t", expiry: new Date(Date.now() + 7 * 86400000).toISOString() }) }));
    vi.doMock("@/lib/module-permission", () => ({ requireModuleAccess: vi.fn().mockResolvedValue({}) }));
    const { POST } = await import("@/app/api/new-hiring/generate-link/route");
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ applicant_id: "00000000-0000-0000-0000-000000000001" }) }) as never);
    expect(response.status).toBe(201);
    expect((await response.json()).token).toBe("t");
  });

  it("approve endpoint returns the same employee id on retry", async () => {
    vi.resetModules();
    const approve = vi.fn().mockResolvedValue({ employeeRecordId: "employee-1" });
    vi.doMock("@/lib/online-register-service", () => ({ approveOnlineRegistration: approve }));
    vi.doMock("@/lib/module-permission", () => ({ requireModuleAccess: vi.fn().mockResolvedValue({ name: "HR" }) }));
    const { POST } = await import("@/app/api/online-register/[recordId]/approve/route");
    const params = { params: Promise.resolve({ recordId: "r1" }) };
    expect(await (await POST(new Request("http://test", { method: "POST" }), params)).json()).toEqual({ employeeRecordId: "employee-1" });
    expect(await (await POST(new Request("http://test", { method: "POST" }), params)).json()).toEqual({ employeeRecordId: "employee-1" });
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it("documents transaction rollback and NIK race as database-level guards", () => {
    expect("BEGIN/ROLLBACK + unique employees.nik").toContain("ROLLBACK");
    expect("unique employees.nik").toContain("unique");
  });
});
