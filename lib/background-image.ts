import "server-only";
import sharp from "sharp";

/**
 * Compresses an uploaded photo down to a data: URI small enough to store in
 * a single Settings row/cell — a Google Sheets cell caps out around 50,000
 * characters, so the target here is well under that regardless of which
 * database provider is active. Tries progressively smaller
 * width/quality combinations until the base64 output fits.
 */

const MAX_DATA_URI_LENGTH = 42_000; // headroom under Sheets' ~50,000 char cell limit
const ATTEMPTS: { width: number; quality: number }[] = [
  { width: 1600, quality: 65 },
  { width: 1200, quality: 55 },
  { width: 900, quality: 50 },
  { width: 700, quality: 45 },
  { width: 500, quality: 40 },
  { width: 360, quality: 35 },
];

export class ImageTooLargeError extends Error {
  constructor() {
    super("This image couldn't be compressed small enough to store. Try a simpler photo or crop it first.");
    this.name = "ImageTooLargeError";
  }
}

export async function compressImageToDataUri(input: Buffer): Promise<string> {
  for (const { width, quality } of ATTEMPTS) {
    const jpegBuffer = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    const base64 = jpegBuffer.toString("base64");
    const dataUri = `data:image/jpeg;base64,${base64}`;
    if (dataUri.length <= MAX_DATA_URI_LENGTH) return dataUri;
  }
  throw new ImageTooLargeError();
}
