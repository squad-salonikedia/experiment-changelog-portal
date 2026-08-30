---
name: flywheel
description: Log, search, and comment on SquadStack voice-agent experiments in the Flywheel changelog. Use when someone says "log this experiment", "record this change", "add this to flywheel", or asks what has been tried — e.g. "what have we tested on Khatabook", "what moved ADC".
---

# Flywheel — experiment changelog

> This is the local project copy — it has no key embedded.
> Users get a personal copy with their token from the dashboard →
> avatar menu → Connect your AI.

Flywheel is SquadStack's shared record of what we changed on voice agents and
what it moved. This skill both **reads** the changelog and **writes** to it.

## Setup

Read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the project's `.env.local`.
All API calls go through the Next.js routes at the app's origin, authenticated with
a Bearer token (personal API token) or session cookie.

Base URL: the running app (default `http://localhost:3000`)

## Reading — what have we already tried?

Use when someone asks what has been tested, what worked, or what happened on a client.

```bash
curl -s "$BASE_URL/api/experiments" \
  -H "Authorization: Bearer $TOKEN"
```

Each entry has: `date`, `client`, `industry`, `useCase`, `bucket`,
`experimentName`, `metricLabel`, `before`, `after`, `direction`,
`evidenceNote`, `loggedBy`, `canEdit`.

Answer from what is actually there. If nothing matches, say so.

## Before writing — read the valid values

```bash
curl -s "$BASE_URL/api/options" \
  -H "Authorization: Bearer $TOKEN"
```

Returns `clients`, `industries`, `buckets`, `metrics`, `useCasesByIndustry`.
**Always check this first and reuse an existing value where one fits.** Inventing
near-duplicates ("Cadence " vs "Cadence") quietly fragments the data.

## Writing — log an experiment

```bash
curl -s -X POST "$BASE_URL/api/experiments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
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
```

For a change with no number attached, mark the metric qualitative:

```json
{"metric": "Call Quality", "qualitative": true, "direction": "better",
 "note": "Reviewers noted more natural pacing"}
```

`direction` is one of `better`, `same`, `worse`.

## Editing

```bash
curl -s -X PATCH "$BASE_URL/api/experiments/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title", "description": "Updated description"}'
```

Only the person who logged an experiment can edit it (403 otherwise).

## Comments — discuss an experiment

Read comments:

```bash
curl -s "$BASE_URL/api/experiments/<id>/comments" \
  -H "Authorization: Bearer $TOKEN"
```

Post a comment:

```bash
curl -s -X POST "$BASE_URL/api/experiments/<id>/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body": "Your comment text here"}'
```

Delete your own comment:

```bash
curl -s -X DELETE "$BASE_URL/api/experiments/<id>/comments?commentId=<commentId>" \
  -H "Authorization: Bearer $TOKEN"
```

## Rules

1. **Never invent numbers.** No before/after given? Log it qualitative.
2. **Reuse existing values** from `/api/options`.
3. **Ask for what is missing.** Client, type of change, title and at least one
   metric are required — never fill them with placeholders.
4. **The title says what changed, not what you hoped for.**
   Good: "Removed the 3rd rebuttal on Path 3". Bad: "Improve conversion".
5. **Confirm before writing.** Show the person what you are about to log and let
   them correct it — a wrong entry is worse than a missing one.
6. Lower is better for `ADC%` and cost metrics. Report raw before/after; the
   tool works out the direction itself.
