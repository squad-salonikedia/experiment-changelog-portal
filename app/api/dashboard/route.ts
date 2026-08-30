import { readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/sheets";

export const dynamic = "force-dynamic";

function read(file: string) {
  return readFileSync(path.join(process.cwd(), "src", file), "utf8");
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Flywheel</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" defer></script>
<style>${read("dashboard.css")}</style>
</head>
<body>
${read("dashboard.html")}
<script>${read("dashboard.js")}</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
