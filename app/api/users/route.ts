import { NextRequest, NextResponse } from "next/server";

import { userInputSchema } from "@/schemas/user.schema";
import { getUsers, createUser } from "@/lib/user-service";
import { toApiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = userInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const user = await createUser(parsed.data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
