import { NextRequest, NextResponse } from "next/server";

import {
  getBackgroundImage,
  setBackgroundImage,
  resetBackgroundImage,
  type BackgroundSurface,
} from "@/lib/settings-service";
import { compressImageToDataUri, ImageTooLargeError } from "@/lib/background-image";
import { toApiErrorResponse } from "@/lib/api-error";

const VALID_SURFACES: BackgroundSurface[] = ["login", "qr", "apply"];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — compressed down well below the Sheets cell limit afterward

function parseSurface(raw: string): BackgroundSurface | null {
  return (VALID_SURFACES as string[]).includes(raw) ? (raw as BackgroundSurface) : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ surface: string }> }) {
  try {
    const { surface: raw } = await params;
    const surface = parseSurface(raw);
    if (!surface) return NextResponse.json({ error: "Unknown background surface." }, { status: 400 });

    const dataUri = await getBackgroundImage(surface);
    return NextResponse.json({ dataUri: dataUri || null });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ surface: string }> }) {
  try {
    const { surface: raw } = await params;
    const surface = parseSurface(raw);
    if (!surface) return NextResponse.json({ error: "Unknown background surface." }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please upload an image file." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 15MB)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = await compressImageToDataUri(buffer);
    await setBackgroundImage(surface, dataUri);
    return NextResponse.json({ dataUri });
  } catch (err) {
    if (err instanceof ImageTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toApiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ surface: string }> }) {
  try {
    const { surface: raw } = await params;
    const surface = parseSurface(raw);
    if (!surface) return NextResponse.json({ error: "Unknown background surface." }, { status: 400 });

    await resetBackgroundImage(surface);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
