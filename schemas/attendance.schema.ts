import { z } from "zod";

/** Satu baris bracket_master dikirim dari Tab "Master Durasi Jam antara" — `id` absen berarti baris baru. */
export const bracketMasterRowSchema = z
  .object({
    id: z.number().int().positive().optional(),
    dayType: z.enum(["Senin-Jumat", "Sabtu", "Minggu"]),
    durasiStart: z.coerce.number().min(0),
    durasiEnd: z.coerce.number().min(0),
    otHours: z.coerce.number().min(0),
  })
  .refine((row) => row.durasiStart < row.durasiEnd, {
    message: "Durasi Start harus lebih kecil dari Durasi End.",
    path: ["durasiEnd"],
  });

export const updateBracketMasterSchema = z.object({
  rows: z.array(bracketMasterRowSchema),
  dayTypes: z.array(z.enum(["Senin-Jumat", "Sabtu", "Minggu"])).optional(),
  /** Optional dari client -- API route memakai nama user dari session sebagai sumber utama, ini cuma fallback. */
  changedBy: z.string().optional(),
});
export type UpdateBracketMasterInput = z.infer<typeof updateBracketMasterSchema>;

/** Body untuk POST /api/attendance/import/commit — `rows` seluruh baris hasil preview (valid + konflik), `decisions` hanya untuk key nik::tanggal yang konflik. */
export const importCommitSchema = z.object({
  sourceFilename: z.string().trim().min(1),
  rows: z.array(
    z.object({
      nik: z.string().trim().min(1),
      nama: z.string(),
      department: z.string(),
      tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      intime: z.string().nullable(),
      outtime: z.string().nullable(),
      it1: z.string().nullable(),
      ot1: z.string().nullable(),
      whour: z.number().nullable(),
      bhour: z.number().nullable(),
      othourRecorded: z.number().nullable(),
      kategori: z.string(),
    }),
  ),
  decisions: z.record(z.string(), z.enum(["overwrite", "skip"])),
});
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export const attendanceCalculationFilterSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  department: z.string().trim().optional(),
  status: z.enum(["Sesuai", "Tidak Sesuai", "Dikoreksi Manual", "Cek Manual", "Tidak Berlaku"]).optional(),
});

export const attendanceCorrectionSchema = z.object({
  id: z.coerce.number().int().positive(),
  newValue: z.coerce.number().finite().min(0),
  note: z.string().trim().min(1, "Correction note wajib diisi."),
});
