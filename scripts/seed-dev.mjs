/**
 * Fills a development database with a few realistic experiments to work against.
 *
 *   node scripts/seed-dev.mjs           # add the examples
 *   node scripts/seed-dev.mjs --reset   # clear everything first, then add them
 *   node scripts/seed-dev.mjs --wipe    # clear everything, add nothing
 *
 * SAFETY: this refuses to run unless DEV_DATABASE=true is set. That flag is the
 * only thing between "reset my test data" and "delete the team's changelog", so
 * set it in the dev project's .env.local and nowhere else — never on Vercel.
 *
 * It leaves five experiments, a few comments and some reactions behind, which is
 * enough for the dashboard to look like a real changelog: the overview tiles have
 * numbers, the breakdown bars have more than one bar, and a detail sheet has both
 * a thread and a related entry to show.
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

if (process.env.DEV_DATABASE !== "true") {
  console.error(`
Refusing to run: DEV_DATABASE is not set to "true".

This script deletes and rewrites experiment data, so it only runs against a
database explicitly marked as a development one. If that is what
${process.env.SUPABASE_URL ?? "this database"} is, add to its .env.local:

  DEV_DATABASE=true

If it is the production project, point .env.local at a separate Supabase
project first — see "A separate database for development" in SETUP.md.
`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const reset = process.argv.includes("--reset");
const wipeOnly = process.argv.includes("--wipe");

const PEOPLE = [
  { email: "saloni.kedia@squadstack.ai", name: "Saloni Kedia", role: "admin" },
  { email: "rajat.sharma@squadstack.ai", name: "Rajat Sharma", role: "member" },
];

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const EXPERIMENTS = [
  {
    date_logged: day(2), logged_by: "Saloni", owner_email: PEOPLE[0].email,
    client: "Khatabook", industry: "BFSI", use_case: "Pre-approved Business Loan",
    bucket: "Cadence", experiment_name: "Shortened the retry window from 3 attempts to 1",
    metric_type: "Quantitative", metric_label: "ADC%",
    before_value: "30", after_value: "15", pct_change: "-50.0%", direction: "",
    evidence_note: "Three retries inside an hour was reading as spam. One attempt, then a callback slot.",
  },
  {
    date_logged: day(5), logged_by: "Saloni", owner_email: PEOPLE[0].email,
    client: "Khatabook", industry: "BFSI", use_case: "Pre-approved Business Loan",
    bucket: "App Opener", experiment_name: 'Added a "how are you" opener before the pitch',
    metric_type: "Quantitative", metric_label: "Conversion%",
    before_value: "8", after_value: "11", pct_change: "37.5%", direction: "",
    evidence_note: "A warmer open bought two more seconds before the first objection.",
  },
  {
    date_logged: day(9), logged_by: "Rajat", owner_email: PEOPLE[1].email,
    client: "DMI", industry: "BFSI", use_case: "PA-PL",
    bucket: "Rebuttal Sequencing", experiment_name: "Removed the third rebuttal on Path 3",
    metric_type: "Quantitative", metric_label: "ADC%",
    before_value: "22", after_value: "19", pct_change: "-13.6%", direction: "",
    evidence_note: "The third rebuttal was where most drop-offs happened. Cutting it lost nothing.",
  },
  {
    date_logged: day(14), logged_by: "Rajat", owner_email: PEOPLE[1].email,
    client: "Everest Fleet", industry: "Logistics", use_case: "Driver Onboarding",
    bucket: "STT/TTS Fix", experiment_name: "Fixed pronunciation of vehicle model names",
    metric_type: "Qualitative", metric_label: "Call Quality",
    before_value: "", after_value: "", pct_change: "", direction: "better",
    evidence_note: "Reviewers stopped flagging the opening line as robotic.",
  },
  {
    date_logged: day(21), logged_by: "Saloni", owner_email: PEOPLE[0].email,
    client: "SuperMoney", industry: "BFSI", use_case: "Card Activation",
    bucket: "Callback Strategy", experiment_name: "Offered a same-evening callback slot instead of next day",
    metric_type: "Quantitative", metric_label: "Callback Success%",
    before_value: "41", after_value: "52", pct_change: "26.8%", direction: "",
    evidence_note: "People who asked to be called back wanted it sooner than we were offering.",
  },
];

const COMMENTS = [
  { on: 0, author: PEOPLE[1], body: "Did connect rate hold up, or did we just move the drop-off later in the day?" },
  { on: 0, author: PEOPLE[0], body: "Connect rate held. I'll add the split by hour to the next one." },
  { on: 2, author: PEOPLE[0], body: "Worth trying the same cut on Path 1 — it has the same shape." },
];

const REACTIONS = [
  { on: 0, by: PEOPLE[1].email, reaction: "up" },
  { on: 2, by: PEOPLE[0].email, reaction: "up" },
  { on: 4, by: PEOPLE[1].email, reaction: "up" },
];

async function clearAll() {
  // Comments have no foreign key, so they have to go first and by hand.
  for (const table of ["experiment_comments", "experiment_reactions", "experiments"]) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(`could not clear ${table}: ${error.message}`);
  }
  console.log("Cleared experiments, comments and reactions.");
}

async function seed() {
  const { error: peopleError } = await supabase
    .from("allowed_users")
    .upsert(PEOPLE, { onConflict: "email" });
  if (peopleError) throw new Error(`could not seed allowed_users: ${peopleError.message}`);

  const { data: rows, error } = await supabase.from("experiments").insert(EXPERIMENTS).select("id");
  if (error) throw new Error(`could not insert experiments: ${error.message}`);

  const ids = rows.map((r) => r.id);

  const { error: commentError } = await supabase.from("experiment_comments").insert(
    COMMENTS.map((c) => ({
      experiment_id: ids[c.on],
      author_email: c.author.email,
      author_name: c.author.name,
      body: c.body,
    }))
  );
  if (commentError) console.warn(`  comments skipped: ${commentError.message}`);

  const { error: reactionError } = await supabase.from("experiment_reactions").insert(
    REACTIONS.map((r) => ({ experiment_id: ids[r.on], user_identity: r.by, reaction: r.reaction }))
  );
  if (reactionError) console.warn(`  reactions skipped: ${reactionError.message}`);

  console.log(`Seeded ${ids.length} experiments, ${COMMENTS.length} comments, ${REACTIONS.length} reactions.`);
  console.log(`People with access: ${PEOPLE.map((p) => p.email).join(", ")}`);
}

try {
  console.log(`Database: ${process.env.SUPABASE_URL}\n`);
  if (reset || wipeOnly) await clearAll();
  if (!wipeOnly) await seed();
  console.log("\nDone.");
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
}
