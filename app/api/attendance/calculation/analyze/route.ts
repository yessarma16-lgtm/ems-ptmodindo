import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error";
import { generateAttendanceAnalysis, OpenAiNotConfiguredError, OpenAiRequestError } from "@/lib/ai/attendance-analysis";
import { attendanceAnalysisRequestSchema } from "@/schemas/attendance.schema";

export async function POST(request: NextRequest) {
  try {
    const parsed = attendanceAnalysisRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Permintaan analisa tidak valid.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const analysis = await generateAttendanceAnalysis(parsed.data);
    return NextResponse.json({ analysis });
  } catch (err) {
    if (err instanceof OpenAiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    if (err instanceof OpenAiRequestError) return NextResponse.json({ error: err.message }, { status: 502 });
    return toApiErrorResponse(err);
  }
}
