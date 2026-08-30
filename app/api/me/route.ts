import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    name: viewer.name,
    email: viewer.email,
    firstName: viewer.firstName,
    role: viewer.role,
  });
}
