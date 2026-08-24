import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getSupabaseClient, isLocalPostgresConfigured } from "@/lib/supabase";

export const MAX_CV_BYTES = 4 * 1024 * 1024;
const MAX_ANALYZED_PAGES = "1-2";
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export class OcrValidationError extends Error {
  constructor(message: string) { super(message); this.name = "OcrValidationError"; }
}

export interface OcrParsedFields {
  name?: string;
  birthDate?: string;
  address?: string;
  nik?: string;
  hpNumber?: string;
  email?: string;
}

export interface OcrDocumentResult {
  documentId: string;
  status: "completed" | "failed";
  parsed: OcrParsedFields;
  warning?: string;
}

let throttleTail: Promise<void> = Promise.resolve();
async function waitForAzureSlot(): Promise<void> {
  const previous = throttleTail;
  let release!: () => void;
  throttleTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  release();
}

function validateFile(file: File): void {
  if (file.size > MAX_CV_BYTES) throw new OcrValidationError("Ukuran CV maksimal 4 MB.");
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new OcrValidationError("Format CV harus PDF, JPG, atau PNG.");
}

async function saveFile(buffer: Buffer, filename: string, mimeType: string, documentId: string): Promise<string> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `ocr/${documentId}-${safeName}`;
  if (isLocalPostgresConfigured() || process.env.NODE_ENV !== "production") {
    const root = path.join(process.cwd(), "data", "uploads", "candidate-documents");
    const target = path.join(root, objectPath.replaceAll("/", path.sep));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return objectPath;
  }
  const bucket = process.env.OCR_STORAGE_BUCKET || "candidate-documents";
  const { error } = await getSupabaseClient().storage.from(bucket).upload(objectPath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return objectPath;
}

function textField(fields: Record<string, any>, names: string[]): string | undefined {
  for (const name of names) {
    const field = fields[name];
    if (typeof field?.confidence === "number" && field.confidence < 0.65) continue;
    const value = field?.valueString ?? field?.content;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parseAzureResult(result: any): OcrParsedFields {
  const fields = result?.analyzeResult?.documents?.[0]?.fields ?? {};
  return {
    name: textField(fields, ["Name", "FullName", "Nama"]),
    birthDate: fields.BirthDate?.valueDate ?? textField(fields, ["BirthDate", "TanggalLahir"]),
    address: textField(fields, ["Address", "Alamat"]),
    nik: textField(fields, ["NIK", "KTP", "KtpNo", "IdentityNumber"]),
    hpNumber: textField(fields, ["PhoneNumber", "MobilePhone", "Phone", "NoHP"]),
    email: textField(fields, ["Email", "EmailAddress"]),
  };
}

async function analyzeWithAzure(buffer: Buffer, mimeType: string): Promise<any> {
  const endpoint = process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT?.replace(/\/$/, "");
  const key = process.env.AZURE_DOC_INTELLIGENCE_KEY;
  if (!endpoint || !key) throw new OcrValidationError("Azure Document Intelligence belum dikonfigurasi.");
  await waitForAzureSlot();
  const url = `${endpoint}/documentintelligence/documentModels/prebuilt-document:analyze?api-version=2024-11-30&pages=${MAX_ANALYZED_PAGES}`;
  const response = await fetch(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": mimeType }, body: buffer as unknown as BodyInit });
  if (!response.ok) throw new Error(`Azure OCR request failed (${response.status}).`);
  const operation = response.headers.get("operation-location");
  if (!operation) return response.json();
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const poll = await fetch(operation, { headers: { "Ocp-Apim-Subscription-Key": key } });
    if (!poll.ok) throw new Error(`Azure OCR polling failed (${poll.status}).`);
    const result = await poll.json();
    if (result.status === "succeeded") return result;
    if (result.status === "failed") throw new Error("Azure OCR gagal menganalisis CV.");
  }
  throw new Error("Azure OCR timeout.");
}

function estimatePageCount(buffer: Buffer, mimeType: string): number {
  if (mimeType !== "application/pdf") return 1;
  const matches = buffer.toString("latin1").match(/\/Type\s*\/Page(?:\s|\/|>)/g);
  return Math.max(1, matches?.length ?? 1);
}

export async function analyzeCandidateCv(applicantId: string, file: File): Promise<OcrDocumentResult> {
  validateFile(file);
  const documentId = crypto.randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveFile(buffer, file.name, file.type, documentId);
  const client = getSupabaseClient();
  await client.from("ocr_documents").insert({ id: documentId, applicant_id: applicantId, original_filename: file.name, storage_path: storagePath, mime_type: file.type, file_size_bytes: file.size, status: "processing" });
  try {
    const raw = await analyzeWithAzure(buffer, file.type);
    const parsed = parseAzureResult(raw);
    const pageCount = estimatePageCount(buffer, file.type);
    const usage = await client.from("ocr_documents").select("id", { count: "exact", head: true }).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
    const warnings = [
      pageCount > 2 ? "CV memiliki lebih dari 2 halaman; OCR hanya menganalisis halaman 1–2." : "",
      (usage.count ?? 0) >= 450 ? "Pemakaian OCR mendekati batas 500 halaman/bulan." : "",
    ].filter(Boolean);
    const warning = warnings.join(" ") || undefined;
    await client.from("ocr_documents").update({ status: "completed", raw_result: raw, parsed_result: parsed, warning, page_count: pageCount, model: "prebuilt-document", updated_at: new Date().toISOString() }).eq("id", documentId);
    if (warning) console.warn(`[ocr] ${warning}`);
    return { documentId, status: "completed", parsed, warning };
  } catch (error) {
    await client.from("ocr_documents").update({ status: "failed", warning: error instanceof Error ? error.message : "OCR failed", updated_at: new Date().toISOString() }).eq("id", documentId);
    throw error;
  }
}
