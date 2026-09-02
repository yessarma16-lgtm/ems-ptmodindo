/**
 * CLI entry point for `npm run assets:mangkir`.
 *
 * Regenerates the base64-embedded Surat Panggilan PDF assets
 * (lib/mangkir-letterhead-data.ts, lib/mangkir-signature-data.ts) from their
 * source files under assets/ — run this after replacing either source file
 * (a new letterhead PDF, or a new signature scan).
 *
 * Assets are embedded as base64 constants rather than read from disk at
 * runtime specifically so they ship in the Vercel serverless function
 * bundle regardless of Next.js's file-tracing behavior for arbitrary
 * binary assets (see lib/mangkir-letterhead-data.ts's header comment).
 *
 * The signature source (assets/mangkir-signature.jpg) is a plain scan on
 * paper — its background is removed here by thresholding on pixel
 * luminance: light pixels (the paper) become fully transparent, dark pixels
 * (the ink) are kept and darkened toward black, with a short linear
 * falloff between the two so stroke edges stay anti-aliased instead of
 * jagged. The threshold/dark cutoffs below were picked by inspecting this
 * particular scan's luminance histogram (a big, distinct cluster for the
 * paper starting around 165) — if a future scan has different lighting,
 * these two numbers are the first thing to re-tune.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const LETTERHEAD_SOURCE = "assets/mangkir-letterhead.pdf";
const LETTERHEAD_OUTPUT = "lib/mangkir-letterhead-data.ts";

const SIGNATURE_SOURCE = "assets/mangkir-signature.jpg";
const SIGNATURE_TRANSPARENT_OUTPUT = "assets/mangkir-signature-transparent.png";
const SIGNATURE_DATA_OUTPUT = "lib/mangkir-signature-data.ts";

/** Luminance >= this -> fully transparent (paper background). */
const BACKGROUND_THRESHOLD = 162;
/** Luminance <= this -> fully opaque, darkened to near-black (ink). */
const INK_THRESHOLD = 90;

async function regenerateLetterhead() {
  const buffer = fs.readFileSync(LETTERHEAD_SOURCE);
  const base64 = buffer.toString("base64");
  const content = `/**
 * PT MOD INDO letterhead (kop surat: logo + company name + rule at top,
 * office address in the footer), used as the background for every Surat
 * Panggilan PDF page (see lib/mangkir-letter.ts, buildMangkirLetterPdf).
 * Embedded as base64 (not read from ${LETTERHEAD_SOURCE} at runtime) so it
 * is guaranteed to be included in the Vercel serverless function bundle
 * regardless of Next.js file-tracing behavior for arbitrary binary assets.
 *
 * To update: replace ${LETTERHEAD_SOURCE} with the new file, then run
 * \`npm run assets:mangkir\` to regenerate this constant.
 */
export const MANGKIR_LETTERHEAD_PDF_BASE64 = "${base64}";
`;
  fs.writeFileSync(LETTERHEAD_OUTPUT, content);
  console.log(`Wrote ${LETTERHEAD_OUTPUT} (${base64.length} base64 chars).`);
}

async function regenerateSignature() {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(SIGNATURE_SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    let alpha: number;
    if (luminance >= BACKGROUND_THRESHOLD) alpha = 0;
    else if (luminance <= INK_THRESHOLD) alpha = 255;
    else alpha = Math.round(255 * (1 - (luminance - INK_THRESHOLD) / (BACKGROUND_THRESHOLD - INK_THRESHOLD)));
    data[idx + 3] = alpha;
    data[idx] = Math.min(r, 40);
    data[idx + 1] = Math.min(g, 40);
    data[idx + 2] = Math.min(b, 40);
  }

  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(SIGNATURE_TRANSPARENT_OUTPUT);
  console.log(`Wrote ${SIGNATURE_TRANSPARENT_OUTPUT} (${width}x${height}).`);

  const base64 = fs.readFileSync(SIGNATURE_TRANSPARENT_OUTPUT).toString("base64");
  const content = `/**
 * HRD signer's scanned signature — background removed (thresholded to
 * transparent by luminance, ink darkened toward black; see
 * scripts/generate-mangkir-assets.ts, which produces this from
 * ${SIGNATURE_SOURCE}). Drawn below "Hormat kami," in the Surat Panggilan
 * PDF (see lib/mangkir-letter.ts, buildMangkirLetterPdf, embedPng +
 * drawImage). Embedded as base64 for the same reason as the letterhead in
 * mangkir-letterhead-data.ts.
 *
 * To update: replace ${SIGNATURE_SOURCE} with the new scan, then run
 * \`npm run assets:mangkir\` to regenerate ${SIGNATURE_TRANSPARENT_OUTPUT}
 * and this constant. If the new scan's lighting differs, re-tune
 * BACKGROUND_THRESHOLD / INK_THRESHOLD in that script first.
 */
export const MANGKIR_SIGNATURE_PNG_BASE64 = "${base64}";
`;
  fs.writeFileSync(SIGNATURE_DATA_OUTPUT, content);
  console.log(`Wrote ${SIGNATURE_DATA_OUTPUT} (${base64.length} base64 chars).`);
}

async function main() {
  await regenerateLetterhead();
  await regenerateSignature();
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
