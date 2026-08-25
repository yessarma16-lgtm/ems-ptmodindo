import "server-only";

import type { AttendanceAnalysisRequest } from "@/schemas/attendance.schema";

export class OpenAiNotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY belum diatur di server.");
    this.name = "OpenAiNotConfiguredError";
  }
}

export class OpenAiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiRequestError";
  }
}

/** Memanggil OpenAI Chat Completions untuk merangkum hasil crosscheck MPP attendance jadi narasi analisa berbahasa Indonesia. */
export async function generateAttendanceAnalysis(input: AttendanceAnalysisRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAiNotConfiguredError();
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

  const { summary, mismatches, dateFrom, dateTo } = input;
  const period = dateFrom && dateTo ? `${dateFrom} s/d ${dateTo}` : "periode yang dipilih";
  const sample = mismatches
    .slice(0, 40)
    .map((row) => `- ${row.tanggal} | ${row.nik} ${row.nama} (${row.department}): System OTH=${row.systemCalculatedOth ?? "-"}, EDIT OTH=${row.finalOth ?? "-"}, Status=${row.status}`)
    .join("\n");

  const prompt = `Kamu adalah analis HR yang meninjau hasil kalkulasi lembur (overtime) karyawan pabrik.
Periode: ${period}
Ringkasan hasil crosscheck:
- Total diproses: ${summary.processed}
- Sesuai (match): ${summary.sesuai}
- Tidak Sesuai (mismatch): ${summary.tidakSesuai}
- Perlu Cek Manual: ${summary.cekManual}
- Tidak Berlaku: ${summary.tidakBerlaku}
- Koreksi manual yang dipertahankan: ${summary.preservedManualCorrections}

Contoh baris bermasalah (maksimal 40 baris pertama, urutan tidak signifikan):
${sample || "(tidak ada baris mismatch/cek manual)"}

Tulis analisa singkat berbahasa Indonesia (maksimal 200 kata) mencakup:
1. Ringkasan kondisi keseluruhan (persentase match vs mismatch).
2. Pola yang terlihat dari data di atas (misal department tertentu dominan bermasalah), hanya jika benar-benar terlihat -- jangan mengarang.
3. Rekomendasi tindak lanjut yang konkret.
Gunakan bullet point singkat, jangan mengulang angka yang sudah jelas di ringkasan di atas secara berlebihan.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new OpenAiRequestError(detail?.error?.message ?? `Permintaan ke OpenAI gagal (${res.status}).`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new OpenAiRequestError("OpenAI tidak mengembalikan hasil analisa.");
  return text.trim();
}
