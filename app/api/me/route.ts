import { NextResponse } from "next/server";
import { requireSession } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = session.user?.name ?? "";
  const email = session.user?.email ?? "";
  const firstName = name.trim().split(/\s+/)[0] ?? "";

  return NextResponse.json({
    name,
    email,
    firstName,
  });
}
