import { NextResponse } from "next/server";
import { requireSession } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: experimentId } = params;
  const body = await request.json();
  const { userIdentity, reaction } = body as {
    userIdentity: string;
    reaction: "up" | "down";
  };

  if (!userIdentity || !["up", "down"].includes(reaction)) {
    return NextResponse.json(
      { error: "userIdentity and reaction (up|down) are required" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("experiment_reactions")
    .select("id")
    .eq("experiment_id", experimentId)
    .eq("user_identity", userIdentity)
    .eq("reaction", reaction)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("experiment_reactions")
      .delete()
      .eq("id", existing.id);
  } else {
    const opposite = reaction === "up" ? "down" : "up";
    await supabase
      .from("experiment_reactions")
      .delete()
      .eq("experiment_id", experimentId)
      .eq("user_identity", userIdentity)
      .eq("reaction", opposite);

    await supabase.from("experiment_reactions").insert({
      experiment_id: experimentId,
      user_identity: userIdentity,
      reaction,
    });
  }

  const { data: reactions } = await supabase
    .from("experiment_reactions")
    .select("user_identity, reaction")
    .eq("experiment_id", experimentId);

  const result = { up: [] as string[], down: [] as string[] };
  for (const r of reactions ?? []) {
    if (r.reaction === "up") result.up.push(r.user_identity);
    else result.down.push(r.user_identity);
  }

  return NextResponse.json(result);
}
