import { NextRequest, NextResponse } from "next/server";

import { masterDataInputSchema } from "@/schemas/master-data.schema";
import {
  isValidMasterCategory,
  isSimpleCategory,
  getSimpleMasterData,
  createSimpleMasterDataItem,
  getLookup,
  getAllLookupIncludingInactive,
  createLookupItem,
} from "@/lib/master-data-service";
import { LOOKUP_TYPES } from "@/config/master-data-sheets";
import { toApiErrorResponse } from "@/lib/api-error";

/**
 * Per-category master data — returns ALL rows (active + inactive) for the
 * Master Data admin UI. For `lookup`, pass `?type=GENDER` to filter to one
 * type, otherwise every type is returned grouped.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  if (!isValidMasterCategory(category)) {
    return NextResponse.json({ error: "Unknown master data category." }, { status: 400 });
  }

  try {
    if (isSimpleCategory(category)) {
      const items = await getSimpleMasterData(category, { activeOnly: false });
      return NextResponse.json({ items });
    }

    const type = request.nextUrl.searchParams.get("type");
    if (type) {
      const items = await getLookup(type, { activeOnly: false });
      return NextResponse.json({ items });
    }
    const grouped = await getAllLookupIncludingInactive();
    return NextResponse.json({ grouped });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  if (!isValidMasterCategory(category)) {
    return NextResponse.json({ error: "Unknown master data category." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = masterDataInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (isSimpleCategory(category)) {
      const item = await createSimpleMasterDataItem(category, parsed.data);
      return NextResponse.json({ item }, { status: 201 });
    }

    const type = parsed.data.type;
    const validType = LOOKUP_TYPES.some((t) => t.type === type);
    if (!type || !validType) {
      return NextResponse.json(
        { error: "Validation failed.", issues: { type: ["A valid lookup type is required."] } },
        { status: 400 },
      );
    }
    const item = await createLookupItem({ ...parsed.data, type });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
