# Experiment Changelog Portal

SquadStack internal dashboard for logging and browsing voice-AI experiments. Data lives in a live Google Sheet; access requires `@squadstack.ai` Google login.

## Quick start (for engineers)

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

See **[SETUP.md](./SETUP.md)** for the full non-engineer-friendly guide (Google OAuth, Apps Script, Vercel).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret |
| `APPS_SCRIPT_URL` | Yes | Google Apps Script web app URL |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `NEXTAUTH_URL` | Yes (prod) | Full site URL, e.g. `https://your-app.vercel.app` |

## Testing

```bash
npm test              # parser unit tests, then the API suite against localhost
npm run test:api -- https://your-app.vercel.app   # the same suite against a deploy
npm run harness       # builds .ui-harness.html — the real UI on a fake API
```

- `scripts/test-import.mjs` — the spreadsheet parser, no server needed.
- `scripts/smoke-test.mjs` — every endpoint: auth, options, create, edit, delete,
  comments, replies, reactions, keys, the access list, ownership 403s. It mints
  a temporary key and a temporary session, and removes everything it creates.
- `scripts/ui-harness.mjs` — opens the dashboard against stubbed API responses,
  so client changes can be checked without a login or any test rows in the
  changelog.

## Database migrations

`supabase/schema.sql` is the starting point; everything in
`supabase/migrations/` is applied by hand, oldest first, in the Supabase
dashboard under **SQL Editor → New query**. All of them are safe to re-run, and
the app degrades gracefully until they are applied — a feature whose column is
missing stays off rather than erroring.

Pending as of the last change: `005_comment_cascade.sql`,
`006_reaction_identity.sql`, `007_comment_replies.sql`.

## Project layout

- `app/` — Next.js pages, login screen, API routes
- `src/dashboard.html` — Your experiment changelog UI
- `google-apps-script/Code.gs` — Paste into Google Apps Script
- `SETUP.md` — Step-by-step setup for non-engineers
