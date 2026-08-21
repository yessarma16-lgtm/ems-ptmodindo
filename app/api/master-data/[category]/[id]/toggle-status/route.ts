import { NextRequest, NextResponse } from "next/server";

import {
  isValidMasterCategory,
  isSimpleCategory,
  toggleSimpleMasterDataStatus,
  toggleLookupStatus,
} from "@/lib/master-data-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Flips a master data item between Active/Inactive (soft deactivate/reactivate). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> },
) {
  const { category, id } = await params;
  if (!isValidMasterCategory(category)) {
    return NextResponse.json({ error: "Unknown master data category." }, { status: 400 });
  }

  try {
    const item = isSimpleCategory(category)
      ? await toggleSimpleMasterDataStatus(category, id)
      : await toggleLookupStatus(id);
    return NextResponse.json({ item });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
