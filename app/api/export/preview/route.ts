import { NextRequest, NextResponse } from "next/server";

import { exportRequestSchema } from "@/schemas/export.schema";
import { buildExportPreview, ExportValidationError } from "@/lib/export-service";
import { toApiErrorResponse } from "@/lib/api-error";

/** Rows beyond this are omitted from the preview response — Generate always uses the full data set. */
const PREVIEW_ROW_LIMIT = 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = exportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { matrix } = await buildExportPreview(parsed.data);

    const sheets = matrix.sheets.map((sheet) => ({
      name: sheet.name,
      columns: sheet.columns.map((c) => ({ label: c.label, columnType: c.columnType, isKey: c.isKey })),
      rows: sheet.rows.slice(0, PREVIEW_ROW_LIMIT),
      totalRows: sheet.rows.length,
      truncated: sheet.rows.length > PREVIEW_ROW_LIMIT,
    }));

    return NextResponse.json({
      templateName: matrix.templateName,
      employeeCount: matrix.employeeCount,
      sheets,
    });
  } catch (err) {
    if (err instanceof ExportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toApiErrorResponse(err);
  }
}
