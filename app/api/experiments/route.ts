import { NextResponse } from "next/server";
import { requireSession } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: experiments, error } = await supabase
    .from("experiments")
    .select("*")
    .order("date_logged", { ascending: false });

  if (error) {
    console.error("Failed to load experiments", error);
    return NextResponse.json(
      { error: "Database read failed" },
      { status: 502 }
    );
  }

  const experimentIds = experiments.map((e) => e.id);

  const { data: reactions } = await supabase
    .from("experiment_reactions")
    .select("experiment_id, user_identity, reaction")
    .in("experiment_id", experimentIds.length ? experimentIds : ["__none__"]);

  const reactionMap = new Map<
    string,
    { up: string[]; down: string[] }
  >();
  for (const r of reactions ?? []) {
    if (!reactionMap.has(r.experiment_id)) {
      reactionMap.set(r.experiment_id, { up: [], down: [] });
    }
    const bucket = reactionMap.get(r.experiment_id)!;
    if (r.reaction === "up") bucket.up.push(r.user_identity);
    else bucket.down.push(r.user_identity);
  }

  const rows = experiments.map((e) => ({
    id: e.id,
    dateLogged: e.date_logged ?? "",
    loggedBy: e.logged_by,
    client: e.client,
    industry: e.industry,
    useCase: e.use_case,
    bucket: e.bucket,
    experimentName: e.experiment_name,
    metricType: e.metric_type,
    metricLabel: e.metric_label,
    before: e.before_value,
    after: e.after_value,
    pctChange: e.pct_change,
    direction: e.direction,
    evidenceNote: e.evidence_note,
    endorsements: e.endorsements,
    pinned: e.pinned,
    reactions: reactionMap.get(e.id) ?? { up: [], down: [] },
  }));

  return NextResponse.json(rows);
}

type EntryPayload = {
  client?: string;
  industry?: string;
  useCase?: string;
  bucket?: string;
  title?: string;
  description?: string;
  owner?: string;
  date?: string;
  metrics?: Array<{
    metric?: string;
    qualitative?: boolean;
    before?: string | number;
    after?: string | number;
    direction?: string;
    note?: string;
  }>;
};

function entryToRecord(entry: EntryPayload) {
  const metric = entry.metrics?.[0] ?? {};
  const qualitative = !!metric.qualitative;

  return {
    client: entry.client ?? "",
    industry: entry.industry ?? "",
    use_case: entry.useCase ?? "",
    bucket: entry.bucket ?? "",
    experiment_name: entry.title ?? "",
    metric_type: qualitative ? "Qualitative" : "Quantitative",
    metric_label: metric.metric ?? "",
    before_value: qualitative ? "" : String(metric.before ?? ""),
    after_value: qualitative ? "" : String(metric.after ?? ""),
    pct_change: "",
    direction: qualitative ? metric.direction ?? "" : "",
    evidence_note: qualitative
      ? metric.note ?? ""
      : entry.description ?? "",
    logged_by: entry.owner ?? "",
    date_logged: entry.date ?? new Date().toISOString().slice(0, 10),
  };
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const entries: EntryPayload[] = Array.isArray(body?.entries)
      ? body.entries
      : [body?.entry ?? body];

    if (!entries.length) {
      return NextResponse.json(
        { error: "No entries provided" },
        { status: 400 }
      );
    }

    const records = entries.map(entryToRecord);

    const { error } = await supabase.from("experiments").insert(records);

    if (error) {
      console.error("Failed to insert experiments", error);
      return NextResponse.json(
        { error: "Database write failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, count: records.length });
  } catch (error) {
    console.error("Failed to append experiments", error);
    return NextResponse.json(
      { error: "Could not write to database" },
      { status: 502 }
    );
  }
}
