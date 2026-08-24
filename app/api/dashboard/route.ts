import { readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const filePath = path.join(process.cwd(), "src", "dashboard.html");
  const html = readFileSync(filePath, "utf8");

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
