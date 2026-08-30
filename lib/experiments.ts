import { canEdit, type Viewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export type ExperimentRow = {
  id: string;
  date_logged: string | null;
  logged_by: string;
  client: string;
  industry: string;
  use_case: string;
  bucket: string;
  experiment_name: string;
  metric_type: string;
  metric_label: string;
  before_value: string;
  after_value: string;
  pct_change: string;
  direction: string;
  evidence_note: string;
  endorsements: string;
  pinned: string;
  created_at: string;
  updated_at: string;
};

/**
 * `date_logged` is a timestamptz, so Postgres hands back a full ISO string
 * ("2026-08-21T00:00:00+00:00"). The UI only ever means a calendar day, so
 * normalise to YYYY-MM-DD here and let the client format for display.
 */
export function toDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export type ExperimentPayload = {
  client?: string;
  industry?: string;
  useCase?: string;
  bucket?: string;
  title?: string;
  description?: string;
  prompt?: string;
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

/**
 * Some columns are added by migrations that may not have been run yet
 * (supabase/migrations/). Each is probed once per server process, so the
 * feature lights up the moment its migration is applied and writes keep
 * succeeding until then instead of failing on an unknown column.
 *
 * The probe result is also surfaced to the UI via /api/options, so a field
 * whose column is missing is hidden rather than silently discarding input.
 */
const columnProbes = new Map<string, Promise<boolean>>();

export function hasColumn(name: string): Promise<boolean> {
  if (!columnProbes.has(name)) {
    columnProbes.set(
      name,
      (async () => {
        const { error } = await supabase.from("experiments").select(name).limit(1);
        return !error;
      })()
    );
  }
  return columnProbes.get(name)!;
}

export const hasPromptColumn = () => hasColumn("prompt");
export const hasOwnerEmailColumn = () => hasColumn("owner_email");

/** Maps the client-side entry shape onto the flat experiments table columns. */
export function payloadToRecord(entry: ExperimentPayload) {
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
    pct_change: qualitative ? "" : computePctChange(metric.before, metric.after),
    direction: qualitative ? metric.direction ?? "" : "",
    evidence_note: qualitative ? metric.note ?? "" : entry.description ?? "",
    logged_by: entry.owner ?? "",
    date_logged: toDateOnly(entry.date) || new Date().toISOString().slice(0, 10),
  };
}

function computePctChange(
  before: string | number | undefined,
  after: string | number | undefined
): string {
  const b = Number(before);
  const a = Number(after);
  if (!isFinite(a) || !isFinite(b) || b === 0) return "";
  return `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%`;
}

/**
 * Adds the columns that only exist once their migration has been run. Without
 * this an insert would fail outright on an unknown column, so the feature
 * degrades to "not stored" rather than "nothing saves".
 */
export async function withOptionalColumns<T extends Record<string, unknown>>(
  record: T,
  extras: { prompt?: string; ownerEmail?: string }
): Promise<T> {
  let out: Record<string, unknown> = record;
  if (extras.prompt !== undefined && (await hasPromptColumn())) {
    out = { ...out, prompt: extras.prompt };
  }
  if (extras.ownerEmail !== undefined && (await hasOwnerEmailColumn())) {
    out = { ...out, owner_email: extras.ownerEmail };
  }
  return out as T;
}

export function rowToEntry(
  row: ExperimentRow,
  reactions: { up: string[]; down: string[] },
  viewer: Viewer
) {
  return {
    prompt: (row as ExperimentRow & { prompt?: string }).prompt ?? "",
    id: row.id,
    date: toDateOnly(row.date_logged),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    loggedBy: row.logged_by,
    client: row.client,
    industry: row.industry,
    useCase: row.use_case,
    bucket: row.bucket,
    experimentName: row.experiment_name,
    metricType: row.metric_type,
    metricLabel: row.metric_label,
    before: row.before_value,
    after: row.after_value,
    pctChange: row.pct_change,
    direction: row.direction,
    evidenceNote: row.evidence_note,
    pinned: row.pinned,
    reactions,
    canEdit: canEdit(viewer, row),
    ownerEmail: (row as ExperimentRow & { owner_email?: string }).owner_email ?? "",
  };
}
