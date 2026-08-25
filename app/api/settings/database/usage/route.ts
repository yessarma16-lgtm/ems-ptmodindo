import { NextResponse } from "next/server";

import { requireModuleAccess } from "@/lib/module-permission";
import { getSupabaseClient } from "@/lib/supabase";
import { toApiErrorResponse } from "@/lib/api-error";

/** Free-tier Supabase Postgres storage cap in bytes (500 MB). */
const FREE_TIER_LIMIT_BYTES = 500 * 1024 * 1024;

export async function GET() {
  try {
    await requireModuleAccess("settingsDatabase");
    const { data, error } = await getSupabaseClient().rpc("get_database_size_bytes");
    if (error) throw error;
    const bytes = Number(data);
    return NextResponse.json({ bytes, limitBytes: FREE_TIER_LIMIT_BYTES });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
