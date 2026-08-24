import { NextRequest, NextResponse } from "next/server";
import { getOnlineRegistrations, updateOnlineRegistration, promoteRegistrationToNewHiring } from "@/lib/online-register-service";
import { buildApplicationId } from "@/lib/application-id";
import { publicApplySchema } from "@/schemas/employee.schema";

async function handle(request: NextRequest) {
  const body = await request.json();
  const recordId = new URL(request.url).searchParams.get("record_id");
  const identifier = String(body.identifier ?? "").trim().toLowerCase();
  const registrations = await getOnlineRegistrations();
  // "NIK" in this system's data model means the company-assigned Employee ID
  // (see "NIK (EMPLOYEE ID)" on the admin form) — a candidate never has one
  // before being hired. In everyday usage "NIK" means the government ID
  // number printed on a KTP, which candidates DO know and enter as "KTP NO."
  // on the apply form — so the login field has to match against ktpNo too,
  // or it can never find a candidate's own submission by the number they'd
  // actually type in.
  const registration = registrations.find((item) => (recordId ? item.recordId === recordId : item.nik.trim().toLowerCase() === identifier || item.ktpNo.trim().toLowerCase() === identifier || item.candidateNumber.trim().toLowerCase() === identifier || (item.submittedAt && buildApplicationId(item.recordId, item.submittedAt).toLowerCase() === identifier)));
  if (!registration) return NextResponse.json({ error: "KTP No. / Candidate No. / Application ID tidak ditemukan." }, { status: 404 });
  if (recordId || body.values) {
    const parsed = publicApplySchema.safeParse(body.values ?? body);
    if (!parsed.success) return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    // Resubmitting here is how a candidate advances through the pipeline
    // (Applicant Pool -> New Hiring -> Employee) on the SAME record, instead
    // of filing a brand-new application — see promoteRegistrationToNewHiring.
    await promoteRegistrationToNewHiring(registration.recordId);
    return NextResponse.json({ registration: await updateOnlineRegistration(registration.recordId, parsed.data) });
  }
  return NextResponse.json({ registration });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function PUT(request: NextRequest) { return handle(request); }
