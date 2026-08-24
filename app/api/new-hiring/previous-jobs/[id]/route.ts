import { NextRequest, NextResponse } from "next/server";
import { previousJobSchema } from "@/schemas/new-hiring.schema";
import { deleteApplicantPreviousJob, updateApplicantPreviousJob } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Public, unauthenticated — see app/api/new-hiring/previous-jobs/route.ts for why. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = previousJobSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { id } = await params;
    return NextResponse.json({ job: await updateApplicantPreviousJob(id, { companyName: parsed.data.companyName, startYear: parsed.data.startYear, endYear: parsed.data.endYear ?? null, lastPosition: parsed.data.lastPosition, description: parsed.data.description }) });
  } catch (err) { return toApiErrorResponse(err); }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await deleteApplicantPreviousJob((await params).id); return new NextResponse(null, { status: 204 }); }
  catch (err) { return toApiErrorResponse(err); }
}
