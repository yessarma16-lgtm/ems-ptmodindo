import { NextRequest, NextResponse } from "next/server";

import { employeeSchema } from "@/schemas/employee.schema";
import { getEmployees, createEmployee, ensureEmployeesSheet } from "@/lib/employee-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";
import { logActivity } from "@/lib/activity-log";

export async function GET() {
  try {
    const employees = await getEmployees();
    return NextResponse.json({ employees });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireModuleAccess("employeesActive", "edit");
    const body = await request.json();
    const parsed = employeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // FINGER CODE is required for admin-created employees (this route is
    // never used by the public apply/walk-in forms — those post to
    // /api/apply/[token] instead, where the field isn't shown or required).
    if (!parsed.data.fingerCode?.trim()) {
      return NextResponse.json(
        { error: "Validation failed.", issues: { fingerCode: ["FINGER CODE wajib diisi"] } },
        { status: 400 },
      );
    }

    await ensureEmployeesSheet();
    const employee = await createEmployee(parsed.data);
    await logActivity(user.name, "Tambah employee");
    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
