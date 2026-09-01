import { NextResponse } from "next/server";
import { canEdit, getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import {
  payloadToPatch,
  rowToEntry,
  withOptionalColumns,
  type ExperimentPayload,
  type ExperimentRow,
} from "@/lib/experiments";

export const dynamic = "force-dynamic";

async function loadReactions(experimentId: string) {
  const { data } = await supabase
    .from("experiment_reactions")
    .select("user_identity, reaction")
    .eq("experiment_id", experimentId);

  const reactions = { up: [] as string[], down: [] as string[] };
  for (const r of data ?? []) {
    if (r.reaction === "up") reactions.up.push(r.user_identity);
    else reactions.down.push(r.user_identity);
  }
  return reactions;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  const { data: existing, error: readError } = await supabase
    .from("experiments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("Failed to read experiment", readError);
    return NextResponse.json({ error: "Database read failed" }, { status: 502 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  const current = existing as ExperimentRow;

  if (!canEdit(viewer, current)) {
    return NextResponse.json(
      {
        error: `Only ${current.logged_by || "the contributor who logged this"} can edit this experiment.`,
      },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as ExperimentPayload;

    // Only what the caller sent. payloadToPatch leaves ownership out entirely —
    // an edit must never reassign a row to whoever is editing it.
    const edits = payloadToPatch(body);
    const patch = await withOptionalColumns(edits, {
      // Omitting the prompt should leave it alone, not erase it.
      prompt: body.prompt,
      // Ownership never changes on edit, so owner_email is deliberately absent.
    });

    if (!Object.keys(patch).length) {
      return NextResponse.json(
        { error: "Nothing to update — send at least one field." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("experiments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update experiment", error);
      return NextResponse.json({ error: "Database write failed" }, { status: 502 });
    }

    const reactions = await loadReactions(id);
    return NextResponse.json({
      ok: true,
      entry: rowToEntry(data as ExperimentRow, reactions, viewer),
    });
  } catch (error) {
    console.error("Failed to update experiment", error);
    return NextResponse.json(
      { error: "Could not write to database" },
      { status: 502 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  // owner_email is what ownsExperiment() actually checks. Selecting only
  // logged_by left it undefined, so every delete fell through to the
  // first-name fallback that exists for pre-migration-002 rows — meaning
  // anyone whose first name matched could delete someone else's experiment.
  const { data: existing } = await supabase
    .from("experiments")
    .select("logged_by, owner_email")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  if (!canEdit(viewer, existing)) {
    return NextResponse.json(
      {
        error: `Only ${existing.logged_by || "the contributor who logged this"} can delete this experiment.`,
      },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("experiments").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete experiment", error);
    return NextResponse.json({ error: "Database write failed" }, { status: 502 });
  }

  // Reactions carry a foreign key and cascade on their own; comments
  // (migration 004) do not, so without this the thread outlives the experiment
  // it belongs to — invisible in the UI and attached to an id nothing resolves.
  const { error: commentError } = await supabase
    .from("experiment_comments")
    .delete()
    .eq("experiment_id", id);
  if (commentError) {
    console.error("Deleted the experiment but left its comments behind", commentError);
  }

  return NextResponse.json({ ok: true });
}
