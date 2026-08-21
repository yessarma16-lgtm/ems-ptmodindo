import { NextRequest, NextResponse } from "next/server";

import { employeeSchema } from "@/schemas/employee.schema";
import { getEmployeeById, updateEmployee, deleteEmployee } from "@/lib/employee-service";
import { toApiErrorResponse } from "@/lib/api-error";

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
    const { id } = await params;
    const body = await request.json();
    const parsed = employeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const employee = await updateEmployee(id, parsed.data);
    return NextResponse.json({ employee });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteEmployee(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
