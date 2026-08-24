import { NextRequest, NextResponse } from "next/server";
import { verifyNikSchema } from "@/schemas/new-hiring.schema";
import { verifyNewHiringNik } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const parsed = verifyNikSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const result = await verifyNewHiringNik(parsed.data.nik);
    return NextResponse.json({ ...result, alert: result.duplicate ? "duplikat" : null });
  } catch (err) { return toApiErrorResponse(err); }
}
