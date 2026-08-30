import { NextResponse } from "next/server";
import { canEdit, getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import {
  payloadToRecord,
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
    const record = payloadToRecord(body);

    // Ownership is not transferable through an edit — a contributor reassigning
    // a row to themselves is exactly the bug this endpoint has to prevent.
    const { logged_by: _ignored, ...editable } = record;
    // Ownership never changes on edit, so owner_email is deliberately absent.
    const patch = await withOptionalColumns(editable, { prompt: body.prompt ?? "" });

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

  const { data: existing } = await supabase
    .from("experiments")
    .select("logged_by")
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

  return NextResponse.json({ ok: true });
}
