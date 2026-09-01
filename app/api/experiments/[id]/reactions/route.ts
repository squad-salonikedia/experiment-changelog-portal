import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // getViewer, not requireSession: a personal token identifies the same person a
  // browser session does, so the skill can react too.
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: experimentId } = params;
  const body = await request.json().catch(() => ({}));
  const { reaction } = body as { reaction?: "up" | "down" };

  if (!reaction || !["up", "down"].includes(reaction)) {
    return NextResponse.json(
      { error: "reaction must be \"up\" or \"down\"" },
      { status: 400 }
    );
  }

  // Identity comes from the session, never from the request body. It used to be
  // whatever name the browser sent, so a crafted request could react as someone
  // else — or undo their reaction — and two people sharing a first name shared
  // a vote. Email is the same identity ownership already uses.
  const userIdentity = viewer.email;

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
