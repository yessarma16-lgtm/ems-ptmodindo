import { NextRequest, NextResponse } from "next/server";

import { employeeSchema, checkPermanenDateRequired } from "@/schemas/employee.schema";
import { getEmployeeById, updateEmployee, deleteEmployee } from "@/lib/employee-service";
import { autoLogPermanentMovement } from "@/lib/employee-movement-service";
import { toApiErrorResponse } from "@/lib/api-error";
import { requireModuleAccess } from "@/lib/module-permission";
import { logActivity } from "@/lib/activity-log";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }
    return NextResponse.json({ employee });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireModuleAccess("employeesActive", "edit");
    const { id } = await params;
    const body = await request.json();
    const parsed = employeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const permanenDateError = checkPermanenDateRequired(parsed.data);
    if (permanenDateError) {
      return NextResponse.json({ error: "Validation failed.", issues: { permanenDate: [permanenDateError] } }, { status: 400 });
    }

    const previous = await getEmployeeById(id);
    const employee = await updateEmployee(id, parsed.data);
    await autoLogPermanentMovement(
      id,
      previous?.contractStatus ?? "",
      employee.contractStatus,
      employee.department,
      employee.position,
      employee.permanenDate,
    );
    await logActivity(user.name, "Edit employee");
    return NextResponse.json({ employee });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireModuleAccess("employeesActive", "edit");
    const { id } = await params;
    await deleteEmployee(id);
    await logActivity(user.name, "Hapus employee");
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
