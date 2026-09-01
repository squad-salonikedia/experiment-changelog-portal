---
name: flywheel
description: Log, search, edit and delete SquadStack voice-agent experiments in the Flywheel changelog. Use when someone says "log this experiment", "record this change", "add this to flywheel", asks what has already been tried for a client, bucket, or metric — e.g. "what have we tested on Khatabook", "did we try changing cadence", "what moved ADC" — or asks "what have I logged".
---

# Flywheel — experiment changelog

> This is the shared copy — it has no key, so it cannot read or write.
> Get your own from http://localhost:3000/dashboard → avatar menu → Connect your AI.

Flywheel is SquadStack's shared record of what we changed on voice agents and
what it moved. This skill **reads**, **writes**, **edits** and **deletes**
entries.

Skill version 3 — if the dashboard says a newer one exists, download it again.

Base URL: `http://localhost:3000`
Set `FLYWHEEL_TOKEN` in your environment first.

## How to answer a log request

Exactly three things, in this order, and nothing else:

1. the confirmation table
2. the line `Confirm to log?`
3. after the write: `Logged.` and the entry link

No preamble, no "I'll add that for you", no explanation of the schema, no
account of which fields you chose or why, no quoting these rules back, no
unprompted comparison to other clients' entries, no summary afterwards.
Analysis only when someone actually asks for it.

**Never show raw JSON.** Not the request body, not the API response. The curl
runs inside the tool call; what the person sees is the table.

## The confirmation table

Before **every** write — log, edit or delete — output one field/value table and
one confirm line:

| Field | Value |
| --- | --- |
| Client | Khatabook |
| Industry | BFSI (assumed) |
| Use case | Pre-approved Business Loan |
| Type of change | Cadence (assumed) |
| Title | Cut retry window from 3 attempts to 1 |
| Date | 2026-09-01 (assumed: today) |
| Metric | ADC% |
| Before → After | 30 → 15 |
| Note |  |

Confirm to log?

- **Every field gets a row, even when its value is empty.** An empty row is an
  offer, not a question — the person fills it if they care and ignores it if
  they don't. Never turn an empty row into a follow-up question.
- Tag anything you inferred rather than heard `(assumed)`.
- Tag any value not already in `/api/options` `(new)`.
- Those two tags are what make guessing safe: a wrong guess is correctable at a
  glance, which is why you guess instead of asking.
- One metric per entry — only the first one is stored.
- Print the table once. Print it again only if they correct something.

## Filling the table — infer, then offer

- **A genuinely new client is allowed.** Add it, tag it `(new)`, do not ask
  for permission to create it.
- **Guess the industry from the client name** and tag it `(assumed)`. Never
  ask for it.
- **Guess the type of change** from what was described; tag it `(assumed)`.
- **Date defaults to today**, tagged `(assumed)`.
- **Never block on a field the API does not require.** Nothing is server-side
  mandatory. Only the client and the title have to be real — those come from
  the person, never from a placeholder. Everything else can be inferred, or go
  in blank and be corrected later.
- If something genuinely must be asked, **ask it in a single pass** — one
  message, every open point at once. Never serial questioning.

## Numbers — ask once, then drop it

When a direction is given with no figures ("conversions increased", "ADC came
down"), ask one precise question:

> How much did conversions move — before → after?

Two short questions is the hard cap for an entire entry. If the person has no
numbers, log it qualitative and say nothing further about it — no second
attempt, no note explaining that numbers were missing.

Qualitative metric:

```json
{"metric": "Conversion%", "qualitative": true, "direction": "better",
 "note": "Reviewers noted more natural pacing"}
```

`direction` is one of `better`, `same`, `worse`. On a qualitative entry the
explanation goes in `note` — `description` is not stored for those.

## Reading — what have we already tried?

Use this whenever someone asks what has been tested, what worked, or what
happened on a client. Fetch and filter; the list is small enough to reason over.

```bash
curl -s "http://localhost:3000/api/experiments" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN"
```

Each entry has: `id`, `date`, `client`, `industry`, `useCase`, `bucket`,
`experimentName`, `metricLabel`, `before`, `after`, `direction`,
`evidenceNote`, `loggedBy`, `ownerEmail`, `canEdit`.

Answer from what is actually there, as a short table — newest first, never as
JSON. If nothing matches, say so; do not speculate about experiments that were
never logged.

## Reading — what have I logged?

`/api/experiments` takes no query parameters, so filter the response yourself
on `ownerEmail`, falling back to `loggedBy` for rows written before emails
were recorded:

```bash
ME=$(curl -s "http://localhost:3000/api/me" -H "Authorization: Bearer $FLYWHEEL_TOKEN" | jq -r .email)

curl -s "http://localhost:3000/api/experiments" -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  | jq --arg me "$ME" '[.[] | select((.ownerEmail | ascii_downcase) == ($me | ascii_downcase))]'
```

`canEdit: true` marks exactly the same rows — it is the server's own answer to
"is this mine", pre-email fallback included — so `select(.canEdit)` works too,
and works without jq if you filter in whatever way is handy.

## Before writing — read the valid values

```bash
curl -s "http://localhost:3000/api/options" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN"
```

Returns `clients`, `industries`, `buckets`, `metrics`, `useCasesByIndustry`.
**Always check this first and reuse an existing value where one fits.** Inventing
near-duplicates ("Cadence " vs "Cadence") quietly fragments the data. Anything
that is genuinely not on the list still goes in — tagged `(new)` in the table.

## Writing — log an experiment

```bash
curl -s -X POST "http://localhost:3000/api/experiments" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entries":[{
    "client": "Khatabook",
    "industry": "BFSI",
    "useCase": "Pre-approved Business Loan",
    "bucket": "Cadence",
    "title": "Cut retry window from 3 attempts to 1",
    "description": "Why it was changed and what it affected.",
    "date": "YYYY-MM-DD",
    "metrics": [{"metric": "ADC%", "before": 30, "after": 15}]
  }]}'
```

The response carries the saved entry's `id`. Reply with `Logged.` and the link:

```
http://localhost:3000/dashboard?exp=<id>
```

## Editing — PATCH /api/experiments/<id>

Send only what changes. Anything you leave out keeps its current value; sending
a field as `""` clears it.

```bash
curl -s -X PATCH "http://localhost:3000/api/experiments/<id>" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-08-28", "description": "Corrected: it shipped on the 28th."}'
```

Field names are the same as one POST entry. `metrics` is replaced as a unit —
send the whole metric, not half of one:

```bash
curl -s -X PATCH "http://localhost:3000/api/experiments/<id>" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metrics": [{"metric": "ADC%", "before": 30, "after": 12}]}'
```

Ownership is not editable — `owner` is ignored on a PATCH. 403 on someone
else's entry, 404 on an unknown id, 400 if the body has no fields at all.

Show the table with the new values, the line `Confirm this edit?`, then
`Updated.` and the link.

## Deleting — DELETE /api/experiments/<id>

```bash
curl -s -X DELETE "http://localhost:3000/api/experiments/<id>" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN"
```

Permanent, and there is no undo. **Always double-check with the person first:**
show the entry as a table, then ask

> Delete this permanently? This cannot be undone. Confirm?

and wait for an explicit yes. Never delete because it seemed implied, never
delete more than the single entry they named, and if the id is ambiguous list
the candidates and ask which one rather than picking. 403 on someone else's
entry, 404 on an unknown id. Then reply `Deleted.` — nothing else.

## Comments — discuss an experiment

Read comments on an experiment:

```bash
curl -s "http://localhost:3000/api/experiments/<id>/comments" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN"
```

Post a comment:

```bash
curl -s -X POST "http://localhost:3000/api/experiments/<id>/comments" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body": "Your comment text here"}'
```

Reply to a comment — pass its id as `parentId`. Threads are one level deep; a
reply to a reply joins the same thread:

```bash
curl -s -X POST "http://localhost:3000/api/experiments/<id>/comments" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body": "Answering that", "parentId": "<commentId>"}'
```

Edit or delete your own comment (yours only — 403 otherwise):

```bash
curl -s -X PATCH "http://localhost:3000/api/experiments/<id>/comments?commentId=<commentId>" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body": "Reworded"}'

curl -s -X DELETE "http://localhost:3000/api/experiments/<id>/comments?commentId=<commentId>" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN"
```

Deleting a comment takes its replies with it.

## Reactions — 👍 / 👎

```bash
curl -s -X POST "http://localhost:3000/api/experiments/<id>/reactions" \
  -H "Authorization: Bearer $FLYWHEEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reaction": "up"}'
```

`reaction` is `up` or `down`. Sending the same one again takes it back, and
`up` replaces a previous `down`. It is recorded against this key's owner —
you cannot react as anyone else. Only do this when asked to.

## Attribution

Every write is recorded against the email tied to this key.
You cannot log, edit or delete on someone else's behalf — `PATCH` and
`DELETE` both return 403 for anything you did not log yourself. That is
deliberate: if a correction is needed on someone else's entry, ask them.

## Rules

1. **Never invent numbers.** Ask once; if there are none, log it qualitative.
2. **Reuse existing values** from `/api/options`; tag real additions `(new)`.
3. **Infer the rest and tag it `(assumed)`** rather than interrogating. Only
   the client and the title must come from the person.
4. **The title says what changed, not what you hoped for.**
   Good: "Removed the 3rd rebuttal on Path 3". Bad: "Improve conversion".
5. **Confirm before every write** — the table, then the confirm line. A wrong
   entry is worse than a missing one, and a wrong delete cannot be undone.
6. Lower is better for `ADC%` and cost metrics. Report raw before/after; the
   tool works out the direction itself.
