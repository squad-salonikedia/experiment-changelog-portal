import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment"
  );
}

/**
 * A local dev server points at whatever SUPABASE_URL says — which, unless a
 * separate project has been set up, is the one the team is using. Logging,
 * editing and deleting while developing then happens in the real changelog,
 * and entries appear and vanish for everyone else with no explanation.
 *
 * DEV_DATABASE=true marks a database as safe to experiment against. This only
 * warns; the seed and reset scripts refuse outright.
 */
if (
  process.env.NODE_ENV !== "production" &&
  !process.env.VERCEL &&
  process.env.DEV_DATABASE !== "true"
) {
  console.warn(
    "\n\x1b[33m⚠  This dev server is writing to a database that is not marked as a\n" +
      "   development one (DEV_DATABASE=true is not set).\n" +
      `   ${supabaseUrl}\n` +
      "   Anything you log, edit or delete here is happening in the real changelog.\x1b[0m\n"
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
