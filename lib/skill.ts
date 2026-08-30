/**
 * The Flywheel skill, as markdown.
 *
 * Two shapes:
 *   - personal (a token is passed): the person's key is written into the file,
 *     so installing it is the entire setup. Nothing to configure afterwards.
 *   - shared (no token): safe to show or link, useless for writing.
 *
 * A personal file IS a credential. Every copy logs experiments as the person it
 * was generated for, so the file says so at the top, loudly.
 */
export function buildSkill(origin: string, token?: string, person?: string): string {
  const personal = !!token;
  const auth = personal ? token! : "$FLYWHEEL_TOKEN";

  const header = personal
    ? `> **This file contains your personal Flywheel key.**
> It logs experiments as **${person}**. Do not share it, commit it, or paste it
> anywhere public. If it leaks, revoke it at ${origin}/dashboard →
> avatar menu → Connect your AI, and download a new one.`
    : `> This is the shared copy — it has no key, so it cannot read or write.
> Get your own from ${origin}/dashboard → avatar menu → Connect your AI.`;

  return `---
name: flywheel
description: Log and search SquadStack voice-agent experiments in the Flywheel changelog. Use when someone says "log this experiment", "record this change", "add this to flywheel", or asks what has already been tried for a client, bucket, or metric — e.g. "what have we tested on Khatabook", "did we try changing cadence", "what moved ADC".
---

# Flywheel — experiment changelog

${header}

Flywheel is SquadStack's shared record of what we changed on voice agents and
what it moved. This skill both **reads** the changelog and **writes** to it.

Base URL: \`${origin}\`
${personal ? "Your key is already set up below — there is nothing to configure." : "Set `FLYWHEEL_TOKEN` in your environment first."}

## Reading — what have we already tried?

Use this whenever someone asks what has been tested, what worked, or what
happened on a client. Fetch and filter; the list is small enough to reason over.

\`\`\`bash
curl -s "${origin}/api/experiments" \\
  -H "Authorization: Bearer ${auth}"
\`\`\`

Each entry has: \`date\`, \`client\`, \`industry\`, \`useCase\`, \`bucket\`,
\`experimentName\`, \`metricLabel\`, \`before\`, \`after\`, \`direction\`,
\`evidenceNote\`, \`loggedBy\`, \`canEdit\`.

Answer from what is actually there. If nothing matches, say so — do not
speculate about experiments that were never logged.

## Before writing — read the valid values

\`\`\`bash
curl -s "${origin}/api/options" \\
  -H "Authorization: Bearer ${auth}"
\`\`\`

Returns \`clients\`, \`industries\`, \`buckets\`, \`metrics\`, \`useCasesByIndustry\`.
**Always check this first and reuse an existing value where one fits.** Inventing
near-duplicates ("Cadence " vs "Cadence") quietly fragments the data. A genuinely
new client or bucket is fine — just make sure it is genuinely new.

## Writing — log an experiment

\`\`\`bash
curl -s -X POST "${origin}/api/experiments" \\
  -H "Authorization: Bearer ${auth}" \\
  -H "Content-Type: application/json" \\
  -d '{"entries":[{
    "client": "Khatabook",
    "industry": "BFSI",
    "useCase": "Pre-approved Business Loan",
    "bucket": "Cadence",
    "title": "Shortened retry window from 3 attempts to 1",
    "description": "Why it was changed and what it affected.",
    "date": "YYYY-MM-DD",
    "metrics": [{"metric": "ADC%", "before": 30, "after": 15}]
  }]}'
\`\`\`

For a change with no number attached, mark the metric qualitative:

\`\`\`json
{"metric": "Call Quality", "qualitative": true, "direction": "better",
 "note": "Reviewers noted more natural pacing"}
\`\`\`

\`direction\` is one of \`better\`, \`same\`, \`worse\`.

## Comments — discuss an experiment

Read comments on an experiment:

\`\`\`bash
curl -s "${origin}/api/experiments/<id>/comments" \\
  -H "Authorization: Bearer ${auth}"
\`\`\`

Post a comment:

\`\`\`bash
curl -s -X POST "${origin}/api/experiments/<id>/comments" \\
  -H "Authorization: Bearer ${auth}" \\
  -H "Content-Type: application/json" \\
  -d '{"body": "Your comment text here"}'
\`\`\`

Delete your own comment:

\`\`\`bash
curl -s -X DELETE "${origin}/api/experiments/<id>/comments?commentId=<commentId>" \\
  -H "Authorization: Bearer ${auth}"
\`\`\`

## Attribution

Every write is recorded against the email tied to this key${person ? ` (**${person}**)` : ""}.
You cannot log on someone else's behalf, and \`PATCH /api/experiments/<id>\`
returns 403 for anything you did not log yourself. That is deliberate — if a
correction is needed on someone else's entry, ask them.

## Rules

1. **Never invent numbers.** No before/after given? Log it qualitative.
2. **Reuse existing values** from \`/api/options\`.
3. **Ask for what is missing.** Client, type of change, title and at least one
   metric are required — never fill them with placeholders.
4. **The title says what changed, not what you hoped for.**
   Good: "Removed the 3rd rebuttal on Path 3". Bad: "Improve conversion".
5. **Confirm before writing.** Show the person what you are about to log and let
   them correct it — a wrong entry is worse than a missing one.
6. Lower is better for \`ADC%\` and cost metrics. Report raw before/after; the
   tool works out the direction itself.
`;
}
