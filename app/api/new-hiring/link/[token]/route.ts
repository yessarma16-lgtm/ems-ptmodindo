import { NextRequest, NextResponse } from "next/server";
import { publicApplySchema } from "@/schemas/employee.schema";
import { getNewHiringByToken, submitNewHiringApplication } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const registration = await getNewHiringByToken(token);
    if (!registration) return NextResponse.json({ error: "Link New Hiring tidak aktif: mungkin sudah digunakan, kedaluwarsa, atau dibatalkan." }, { status: 410 });
    return NextResponse.json({ registration });
  } catch (err) { return toApiErrorResponse(err); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const parsed = publicApplySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { token } = await params;
    const registration = await submitNewHiringApplication(token, parsed.data);
    return NextResponse.json({ registration });
  } catch (err) { return toApiErrorResponse(err); }
}
