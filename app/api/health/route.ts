import { NextResponse } from "next/server";

import { getDatabaseAdapter, getDatabaseProvider, isDatabaseConfigured } from "@/lib/database/database";
import { getSpreadsheetMetadata } from "@/lib/google-sheets";

/**
 * Connection health check. Response shape is intentionally minimal and
 * safe — never includes credentials or raw provider errors, only a status
 * flag plus the active database provider ("sqlite" | "google" | "postgres")
 * and environment, for the Settings page to display.
 */
export async function GET() {
  const provider = getDatabaseProvider();
  const environment = provider === "sqlite" ? "Development" : "Production";

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        status: "error",
        database: { provider, connected: false },
        environment,
        error: "Database connection is not configured.",
      },
      { status: 503 },
    );
  }

  const result = await getDatabaseAdapter().testConnection();
  if (!result.ok) {
    return NextResponse.json(
      {
        status: "error",
        database: { provider, connected: false },
        environment,
        error: result.detail ?? "Unable to connect to Employee Database.",
      },
      { status: 503 },
    );
  }

  // Bonus, Google-only: surface spreadsheet title/sheet list for the Settings UI.
  let spreadsheet: { title: string; sheets: string[] } | undefined;
  if (provider === "google") {
    try {
      spreadsheet = await getSpreadsheetMetadata();
    } catch {
      // Connection already verified ok above — metadata is a display nicety only.
    }
  }

  return NextResponse.json({
    status: "ok",
    database: { provider, connected: true },
    environment,
    ...(spreadsheet ? { spreadsheet } : {}),
  });
}
