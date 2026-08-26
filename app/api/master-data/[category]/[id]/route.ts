import { NextRequest, NextResponse } from "next/server";

import { masterDataInputSchema } from "@/schemas/master-data.schema";
import {
  isValidMasterCategory,
  isSimpleCategory,
  updateSimpleMasterDataItem,
  updateLookupItem,
  deleteSimpleMasterDataItem,
  deleteLookupItem,
} from "@/lib/master-data-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> },
) {
  const { category, id } = await params;
  if (!isValidMasterCategory(category)) {
    return NextResponse.json({ error: "Unknown master data category." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = masterDataInputSchema.partial({ code: true, name: true }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const item = isSimpleCategory(category)
      ? await updateSimpleMasterDataItem(category, id, parsed.data)
      : await updateLookupItem(id, parsed.data);

    return NextResponse.json({ item });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

/** Permanently removes a master data entry. Irreversible — unlike toggle-status's soft deactivate. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> },
) {
  const { category, id } = await params;
  if (!isValidMasterCategory(category)) {
    return NextResponse.json({ error: "Unknown master data category." }, { status: 400 });
  }

  try {
    if (isSimpleCategory(category)) await deleteSimpleMasterDataItem(category, id);
    else await deleteLookupItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
