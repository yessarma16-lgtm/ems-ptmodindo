import { z } from "zod";

export const verifyNikSchema = z.object({ nik: z.string().trim().min(1, "NIK wajib diisi") });
export type VerifyNikInput = z.infer<typeof verifyNikSchema>;

export const generateNewHiringLinkSchema = z.object({ applicant_id: z.string().uuid() });

export const previousJobSchema = z.object({
  companyName: z.string().trim().min(1, "Nama perusahaan wajib diisi"),
  startYear: z.coerce.number().int().min(1900).max(2200),
  endYear: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  lastPosition: z.string().trim().default(""),
  description: z.string().trim().default(""),
}).refine((value) => value.endYear == null || value.endYear >= value.startYear, {
  message: "Tahun selesai tidak boleh sebelum tahun mulai", path: ["endYear"],
});
