import { NextResponse } from "next/server";

import { buildImportTemplateBuffer } from "@/lib/employee-import";
import { toApiErrorResponse } from "@/lib/api-error";

/** Blank .xlsx with the correct column headers — download link in the Import dialog. */
export async function GET() {
  try {
    const buffer = await buildImportTemplateBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Employee_Import_Template.xlsx"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
