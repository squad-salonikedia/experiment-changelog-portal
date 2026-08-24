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

## Project layout

- `app/` — Next.js pages, login screen, API routes
- `src/dashboard.html` — Your experiment changelog UI
- `google-apps-script/Code.gs` — Paste into Google Apps Script
- `SETUP.md` — Step-by-step setup for non-engineers
