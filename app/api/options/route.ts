import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";
import { hasOwnerEmailColumn, hasPromptColumn } from "@/lib/experiments";

export const dynamic = "force-dynamic";

/**
 * Curated starting points. Anything already present in the data is merged on top,
 * so a value that exists on a row can never be missing from its own dropdown —
 * which is what silently reassigned owners when a name was absent from the list.
 */
const SEED = {
  clients: [
    "Khatabook", "DMI", "TDL", "SuperMoney", "PhonePe",
    "TVS Motor Company", "Naukri.com", "Everest Fleet",
  ],
  industries: ["BFSI", "Automotive", "Recruitment", "Mobility", "Retail", "E-commerce", "Logistics"],
  buckets: [
    "Cadence", "Pitch", "App Opener", "Rebuttal Sequencing", "Hangup Timing",
    "KYC Flow", "STT/TTS Fix", "Disposition Logic", "Callback Strategy",
    "Call Flow", "App Journey", "Prompt", "Path / Traffic Split", "Infra",
    "Audio", "Entity Change", "Voice Agent Parameter", "Data Reprocessing",
  ],
  metrics: [
    "ADC%", "Conversion%", "OA%", "Connect Rate%",
    "Callback Success%", "NPS", "OA/day", "QoC%",
  ],
};

function merge(seed: string[], fromData: (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const value of [...seed, ...fromData]) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: rows }, { data: people }, promptReady, ownerEmailReady] =
    await Promise.all([
      supabase
        .from("experiments")
        .select("client, industry, use_case, bucket, metric_label, logged_by"),
      supabase.from("allowed_users").select("name"),
      hasPromptColumn(),
      hasOwnerEmailColumn(),
    ]);

  const data = rows ?? [];

  // Use cases are industry-scoped so the form can narrow the second dropdown.
  const useCasesByIndustry: Record<string, string[]> = {};
  for (const industry of merge(SEED.industries, data.map((r) => r.industry))) {
    useCasesByIndustry[industry] = [];
  }
  for (const row of data) {
    const industry = (row.industry ?? "").trim();
    const useCase = (row.use_case ?? "").trim();
    if (!industry || !useCase) continue;
    if (!useCasesByIndustry[industry]) useCasesByIndustry[industry] = [];
    if (!useCasesByIndustry[industry].some((u) => u.toLowerCase() === useCase.toLowerCase())) {
      useCasesByIndustry[industry].push(useCase);
    }
  }

  return NextResponse.json({
    clients: merge(SEED.clients, data.map((r) => r.client)),
    industries: merge(SEED.industries, data.map((r) => r.industry)),
    buckets: merge(SEED.buckets, data.map((r) => r.bucket)),
    metrics: merge(SEED.metrics, data.map((r) => r.metric_label)),
    owners: merge(
      [],
      [
        ...data.map((r) => r.logged_by),
        ...(people ?? []).map((p) => (p.name ?? "").split(/\s+/)[0]),
        viewer.firstName,
      ]
    ),
    useCasesByIndustry,
    // The UI hides fields whose column does not exist yet, so nothing the user
    // types is silently thrown away before its migration has been run.
    features: { prompt: promptReady, ownerEmail: ownerEmailReady },
  });
}
