import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import { generateToken, tokensEnabled } from "@/lib/tokens";
import { SKILL_VERSION } from "@/lib/skill";

export const dynamic = "force-dynamic";

/**
 * Tokens can only be managed from a real browser session. Allowing a token to
 * mint more tokens would turn one leaked string into permanent access.
 */
async function sessionViewer() {
  const viewer = await getViewer();
  if (!viewer || viewer.via !== "session") return null;
  return viewer;
}

export async function GET() {
  const viewer = await sessionViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await tokensEnabled())) {
    return NextResponse.json({ enabled: false, tokens: [] });
  }

  // skill_version only exists once migration 008 is run, so ask for it and fall
  // back to the older shape rather than failing the whole list.
  const withVersion = await supabase
    .from("api_tokens")
    .select("id, name, prefix, created_at, last_used_at, skill_version")
    .eq("user_email", viewer.email)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  let data: Record<string, unknown>[] | null = withVersion.data;
  if (withVersion.error) {
    const legacy = await supabase
      .from("api_tokens")
      .select("id, name, prefix, created_at, last_used_at")
      .eq("user_email", viewer.email)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    data = legacy.data;
  }

  return NextResponse.json({
    enabled: true,
    tokens: data ?? [],
    skillVersion: SKILL_VERSION,
  });
}

export async function POST(request: Request) {
  const viewer = await sessionViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await tokensEnabled())) {
    return NextResponse.json(
      { error: "Token storage is not set up yet. Run migration 003_api_tokens.sql." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 60) || "My AI assistant";

  const { token, hash, prefix } = generateToken();

  const { error } = await supabase.from("api_tokens").insert({
    user_email: viewer.email,
    name,
    token_hash: hash,
    prefix,
  });

  if (error) {
    console.error("Failed to create token", error);
    return NextResponse.json({ error: "Could not create token" }, { status: 502 });
  }

  // The only time the plaintext is ever returned.
  return NextResponse.json({ ok: true, token, name, prefix });
}

export async function DELETE(request: Request) {
  const viewer = await sessionViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Scoped to the owner's email so nobody can revoke someone else's token.
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_email", viewer.email);

  if (error) {
    console.error("Failed to revoke token", error);
    return NextResponse.json({ error: "Could not revoke token" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
