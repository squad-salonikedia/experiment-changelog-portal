import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import { buildSkill, SKILL_VERSION } from "@/lib/skill";
import { generateToken, tokensEnabled } from "@/lib/tokens";

export const dynamic = "force-dynamic";

let versionColumn: Promise<boolean> | null = null;
function hasSkillVersionColumn(): Promise<boolean> {
  if (!versionColumn) {
    versionColumn = (async () => {
      const { error } = await supabase.from("api_tokens").select("skill_version").limit(1);
      return !error;
    })();
  }
  return versionColumn;
}

/** GET — the shared, key-free copy. Safe to read or link; cannot write. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Unauthorized", { status: 401 });

  return new NextResponse(buildSkill(new URL(request.url).origin), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * POST — mints a token and returns the skill with that key written into it.
 *
 * This is the whole setup for a person: download once, drop the file in, never
 * think about it again. The file is a credential from that moment on, which is
 * why it is only ever generated for the signed-in person and says so in bold
 * at the top.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A token must never be able to mint another token.
  if (viewer.via !== "session") {
    return NextResponse.json(
      { error: "Sign in on the site to generate a key." },
      { status: 403 }
    );
  }
  if (!(await tokensEnabled())) {
    return NextResponse.json(
      { error: "Token storage is not set up yet. Run migration 003_api_tokens.sql." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const label = String(body?.name ?? "").trim().slice(0, 60) || "Claude skill";

  const { token, hash, prefix } = generateToken();
  const record: Record<string, unknown> = {
    user_email: viewer.email,
    name: label,
    token_hash: hash,
    prefix,
  };

  // skill_version arrives with migration 008. Without it the key is still
  // created, it just cannot be flagged as stale later.
  if (await hasSkillVersionColumn()) record.skill_version = SKILL_VERSION;

  const { error } = await supabase.from("api_tokens").insert(record);

  if (error) {
    console.error("Failed to create token", error);
    return NextResponse.json({ error: "Could not create your key" }, { status: 502 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    filename: "flywheel.md",
    prefix,
    content: buildSkill(origin, token, `${viewer.name} <${viewer.email}>`),
  });
}
