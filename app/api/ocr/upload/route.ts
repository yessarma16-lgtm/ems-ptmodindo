import { NextRequest, NextResponse } from "next/server";
import { analyzeCandidateCv } from "@/lib/ocr/azure-document-intelligence";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";

export async function POST(request: NextRequest) {
  try {
    await requireModuleAccess("onlineRegister", "edit");
    const form = await request.formData();
    const applicantId = String(form.get("applicant_id") ?? "");
    const file = form.get("file");
    if (!applicantId || !(file instanceof File)) return NextResponse.json({ error: "applicant_id dan file CV wajib diisi." }, { status: 400 });
    return NextResponse.json(await analyzeCandidateCv(applicantId, file), { status: 201 });
  } catch (err) { return toApiErrorResponse(err); }
}
