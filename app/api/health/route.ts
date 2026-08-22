import { NextResponse } from "next/server";

import { getDatabaseAdapter, getDatabaseProvider, isDatabaseConfigured } from "@/lib/database/database";

export async function GET() {
  const provider = getDatabaseProvider();
  const environment = "Production" as const;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ status: "error", database: { provider, connected: false }, environment, error: "Database connection is not configured." }, { status: 503 });
  }

  const result = await getDatabaseAdapter().testConnection();
  if (!result.ok) {
    return NextResponse.json({ status: "error", database: { provider, connected: false }, environment, error: result.detail ?? "Unable to connect to Employee Database." }, { status: 503 });
  }

  return NextResponse.json({ status: "ok", database: { provider, connected: true }, environment });
}
