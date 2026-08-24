import { NextRequest, NextResponse } from "next/server";
import { previousJobSchema } from "@/schemas/new-hiring.schema";
import { createApplicantPreviousJob, getApplicantPreviousJobs } from "@/lib/online-register-service";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Public, unauthenticated — a candidate on the New Hiring self-service page
 * (/apply/new-hiring, after looking themselves up by NIK/Application ID)
 * reads and writes their own previous-jobs rows here, the same way
 * /api/new-hiring/lookup lets them read/update their own registration:
 * trust is "you know the applicant_id (record UUID)", not a login session.
 * The admin-side CandidateEnrichmentCard (components/employees/) calls the
 * same endpoint from within the authenticated /recruitment/[id] page.
 */
export async function GET(request: NextRequest) {
  try {
    const applicantId = new URL(request.url).searchParams.get("applicant_id");
    if (!applicantId) return NextResponse.json({ error: "applicant_id wajib diisi" }, { status: 400 });
    return NextResponse.json({ jobs: await getApplicantPreviousJobs(applicantId) });
  } catch (err) { return toApiErrorResponse(err); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const applicantId = typeof body.applicant_id === "string" ? body.applicant_id : "";
    const parsed = previousJobSchema.safeParse(body);
    if (!applicantId || !parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.success ? {} : parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json({ job: await createApplicantPreviousJob(applicantId, { companyName: parsed.data.companyName, startYear: parsed.data.startYear, endYear: parsed.data.endYear ?? null, lastPosition: parsed.data.lastPosition, description: parsed.data.description }) }, { status: 201 });
  } catch (err) { return toApiErrorResponse(err); }
}
