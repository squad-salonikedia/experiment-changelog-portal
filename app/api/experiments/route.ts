import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import {
  payloadToRecord,
  rowToEntry,
  withOptionalColumns,
  type ExperimentPayload,
  type ExperimentRow,
} from "@/lib/experiments";

export const dynamic = "force-dynamic";

async function loadReactionMap(experimentIds: string[]) {
  const { data: reactions } = await supabase
    .from("experiment_reactions")
    .select("experiment_id, user_identity, reaction")
    .in("experiment_id", experimentIds.length ? experimentIds : ["__none__"]);

  const map = new Map<string, { up: string[]; down: string[] }>();
  for (const r of reactions ?? []) {
    if (!map.has(r.experiment_id)) map.set(r.experiment_id, { up: [], down: [] });
    const bucket = map.get(r.experiment_id)!;
    if (r.reaction === "up") bucket.up.push(r.user_identity);
    else bucket.down.push(r.user_identity);
  }
  return map;
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: experiments, error } = await supabase
    .from("experiments")
    .select("*")
    .order("date_logged", { ascending: false });

  if (error) {
    console.error("Failed to load experiments", error);
    return NextResponse.json({ error: "Database read failed" }, { status: 502 });
  }

  const rows = (experiments ?? []) as ExperimentRow[];
  const reactionMap = await loadReactionMap(rows.map((e) => e.id));

  return NextResponse.json(
    rows.map((row) =>
      rowToEntry(row, reactionMap.get(row.id) ?? { up: [], down: [] }, viewer)
    )
  );
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const entries: ExperimentPayload[] = Array.isArray(body?.entries)
      ? body.entries
      : [body?.entry ?? body];

    if (!entries.length) {
      return NextResponse.json({ error: "No entries provided" }, { status: 400 });
    }

    // Fall back to the signed-in user so a row can never land without an owner.
    const records = await Promise.all(
      entries.map(async (entry) => {
        const record = payloadToRecord(entry);
        if (!record.logged_by) record.logged_by = viewer.firstName;
        // The creator owns the row; email is what permission checks use.
        return withOptionalColumns(record, {
          prompt: entry.prompt ?? "",
          ownerEmail: viewer.email,
        });
      })
    );

    const { data, error } = await supabase
      .from("experiments")
      .insert(records)
      .select("*");

    if (error) {
      console.error("Failed to insert experiments", error);
      return NextResponse.json({ error: "Database write failed" }, { status: 502 });
    }

    // Return the saved rows so the dashboard can merge them without refetching.
    const saved = (data ?? []) as ExperimentRow[];
    return NextResponse.json({
      ok: true,
      count: saved.length,
      entries: saved.map((row) => rowToEntry(row, { up: [], down: [] }, viewer)),
    });
  } catch (error) {
    console.error("Failed to append experiments", error);
    return NextResponse.json(
      { error: "Could not write to database" },
      { status: 502 }
    );
  }
}
