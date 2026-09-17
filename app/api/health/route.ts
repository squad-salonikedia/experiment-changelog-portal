import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Keepalive probe, hit once a day by the Vercel cron in vercel.json.
 *
 * Supabase's free plan pauses a project after 7 days with no requests. A pause
 * does not just take the portal offline — the invite-list read in lib/auth.ts
 * fails too, so every member who signs in is told the portal is invite-only and
 * that they need access. One real query a day keeps that timer from ever
 * running out.
 *
 * Fails closed: middleware.ts does not cover /api/health, so without the shared
 * secret this would be a public endpoint. Vercel sends the header below
 * automatically on scheduled invocations once CRON_SECRET is set on the project.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("Keepalive is not configured: CRON_SECRET is unset");
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set on this deployment" },
      { status: 503 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Deliberately a real query. Booting the function is not activity as far as
  // Supabase is concerned — only something that reaches Postgres resets the
  // clock. head:true keeps it to a count, so it stays cheap as the table grows.
  const { count, error } = await supabase
    .from("experiments")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("Keepalive query failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    experiments: count ?? 0,
    checkedAt: new Date().toISOString(),
  });
}
