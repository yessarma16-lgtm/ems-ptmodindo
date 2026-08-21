import { NextResponse } from "next/server";

import { DatabaseNotConfiguredError, DatabaseConnectionError, RecordNotFoundError } from "@/lib/database/errors";
import { EmployeeNotFoundError } from "@/lib/employee-service";
import { MasterDataNotFoundError } from "@/lib/master-data-service";
import { DuplicateSheetNameError } from "@/lib/export-template-service";
import { UserNotFoundError } from "@/lib/user-service";
import {
  RegistrationIncompleteError,
  RegistrationAlreadyDecidedError,
  RegistrationAlreadySubmittedError,
} from "@/lib/online-register-service";
import { AttendanceProviderNotSupportedError, AttendanceValidationError } from "@/lib/database/attendance-errors";
import { ImportParseError } from "@/lib/attendance/importer";
import { ModuleAuthenticationError, ModulePermissionError } from "@/lib/module-permission";

/**
 * Converts a thrown error from the service layer into a safe JSON response.
 * Never forwards raw error messages/stack traces from the active database
 * provider to the client — those are logged server-side only. Works the
 * same regardless of whether SQLite or Google Sheets is the active
 * provider, since both throw (or extend) these generic error classes.
 */
export function toApiErrorResponse(err: unknown): NextResponse {
  if (err instanceof ModuleAuthenticationError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ModulePermissionError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof EmployeeNotFoundError) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (err instanceof UserNotFoundError) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (err instanceof MasterDataNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof DuplicateSheetNameError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof RegistrationIncompleteError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof RegistrationAlreadyDecidedError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof RegistrationAlreadySubmittedError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof RecordNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof AttendanceProviderNotSupportedError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  if (err instanceof AttendanceValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ImportParseError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  if (err instanceof DatabaseConnectionError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }

  console.error("[api] unexpected error:", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
