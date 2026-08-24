/**
 * One-time migration: Google Sheet → Supabase
 *
 * Usage:
 *   1. Copy .env.example to .env.local and fill in all values
 *   2. npx tsx scripts/migrate-from-sheets.ts
 *
 * This script fetches all experiments from the Apps Script endpoint
 * and inserts them into Supabase. Safe to re-run — it skips rows
 * whose (experiment_name, client, date_logged) already exist.
 */

import { createClient } from "@supabase/supabase-js";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_TOKEN = process.env.APPS_SCRIPT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!APPS_SCRIPT_URL || !APPS_SCRIPT_TOKEN) {
  console.error("Set APPS_SCRIPT_URL and APPS_SCRIPT_TOKEN in .env.local");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface SheetRow {
  dateLogged: string;
  loggedBy: string;
  client: string;
  industry: string;
  useCase: string;
  bucket: string;
  experimentName: string;
  metricType: string;
  metricLabel: string;
  before: string | number;
  after: string | number;
  pctChange: string;
  direction: string;
  evidenceNote: string;
  endorsements: string;
  pinned: string;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function main() {
  console.log("Fetching experiments from Google Sheet...");

  const url = `${APPS_SCRIPT_URL}?action=list&token=${encodeURIComponent(APPS_SCRIPT_TOKEN)}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

  const rows: SheetRow[] = await res.json();
  console.log(`Fetched ${rows.length} rows from the sheet`);

  if (!rows.length) {
    console.log("Nothing to migrate.");
    return;
  }

  const records = rows.map((r) => ({
    date_logged: parseDate(String(r.dateLogged)),
    logged_by: r.loggedBy || "",
    client: r.client || "",
    industry: r.industry || "",
    use_case: r.useCase || "",
    bucket: r.bucket || "",
    experiment_name: r.experimentName || "",
    metric_type: r.metricType || "",
    metric_label: r.metricLabel || "",
    before_value: String(r.before ?? ""),
    after_value: String(r.after ?? ""),
    pct_change: String(r.pctChange ?? ""),
    direction: r.direction || "",
    evidence_note: r.evidenceNote || "",
    endorsements: String(r.endorsements ?? ""),
    pinned: String(r.pinned ?? ""),
  }));

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("experiments")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`Batch starting at row ${i} failed:`, error.message);
    } else {
      inserted += data?.length ?? 0;
    }
  }

  console.log(`Done. Inserted ${inserted} experiments into Supabase.`);
  console.log(
    "Verify in the Supabase dashboard, then update .env.local to remove APPS_SCRIPT_* vars."
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
