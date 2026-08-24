# Experiment Changelog Portal — Setup Guide

This guide is written for non-engineers. You only need to do **three setup steps** once; after that the site stays live and updates automatically when the Google Sheet changes.

## What you get

- A public URL (e.g. `https://experiment-changelog.vercel.app`)
- **Google login required** — only `@squadstack.ai` accounts can open the dashboard
- Live data from your Google Sheet (no copy-paste, no manual export)
- The same dashboard UI you already have (filters, log experiment, upload CSV, etc.)

---

## Step 1 — Update Google Apps Script (~5 minutes)

Your sheet already uses Apps Script to **add** rows. We extend it so the website can also **read** rows.

1. Open your Google Sheet: [Experiment Changelog Sheet](https://docs.google.com/spreadsheets/d/1rFzvgx8jP7453egcse4VjprxkG0Yp2CUB2wdcqg420w/edit)
2. Go to **Extensions → Apps Script**
3. Open the file `google-apps-script/Code.gs` in this project folder and **copy all of it**
4. In Apps Script, either replace your existing code or merge the `action=list` part at the top of `doGet`
5. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (the URL is secret; the website still requires SquadStack login)
6. Copy the **Web app URL** — you will paste this into Vercel as `APPS_SCRIPT_URL`

> **Do I need to give Cursor access to Apps Script?** No. You paste the code yourself in the Google Apps Script editor (Steps 1–4 above). That is the safest approach.

Test the read endpoint: open this in your browser (while logged into Google):

```
YOUR_APPS_SCRIPT_URL?action=list
```

You should see a JSON list of experiments.

---

## Step 2 — Create Google login credentials (~10 minutes)

The website uses “Sign in with Google” and only allows `@squadstack.ai` emails.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or pick an existing SquadStack project)
3. Go to **APIs & Services → OAuth consent screen**
   - User type: **Internal** (if you have Google Workspace) — this automatically limits to SquadStack
   - App name: `Experiment Changelog`
   - Support email: your email
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Experiment Changelog Portal`
   - Authorized redirect URIs — add **both** (replace with your real Vercel URL after deploy):
     - `http://localhost:3000/api/auth/callback/google`
     - `https://YOUR-APP-NAME.vercel.app/api/auth/callback/google`
5. Copy the **Client ID** and **Client secret**

---

## Step 3 — Deploy on Vercel (~10 minutes)

Vercel hosts the website and runs the secure backend (so API keys never sit in the browser).

### Option A — Deploy via GitHub (recommended)

1. Push this project to GitHub (ask an engineer to help once, or use Cursor’s “Share on Cursor” feature)
2. Go to [vercel.com](https://vercel.com) and sign in
3. **Add New Project** → import the GitHub repo
4. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|------|--------|
| `GOOGLE_CLIENT_ID` | From Step 2 |
| `GOOGLE_CLIENT_SECRET` | From Step 2 |
| `APPS_SCRIPT_URL` | From Step 1 |
| `NEXTAUTH_SECRET` | Any long random string (e.g. run `openssl rand -base64 32` or use a password generator) |
| `NEXTAUTH_URL` | `https://YOUR-APP-NAME.vercel.app` |

5. Click **Deploy**
6. After deploy, go back to Google OAuth (Step 2) and add your real Vercel URL to redirect URIs if you used a placeholder

### Option B — Ask an engineer to deploy

Send them this repo folder. They run:

```bash
npm install
npm run build
npx vercel --prod
```

---

## How security works

| Layer | What it does |
|-------|----------------|
| Vercel login wall | Every page except the login screen requires a signed-in session |
| Google OAuth | Only real Google accounts can sign in |
| `@squadstack.ai` check | Personal Gmail accounts are rejected even if they guess the URL |
| Server-side sheet access | The Apps Script URL is stored on Vercel, not in the browser |
| Google Sheet permissions | The sheet itself stays private in Google Drive |

Sharing the dashboard link **does not** grant access — people still must sign in with a SquadStack Google account.

---

## Share with your team

Once deployed, send everyone:

> **Experiment Changelog:** https://YOUR-APP-NAME.vercel.app  
> Sign in with your `@squadstack.ai` Google account.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Access denied” after Google login | Make sure you used a `@squadstack.ai` account |
| Dashboard empty / “Could not load live sheet data” | Check `APPS_SCRIPT_URL` in Vercel; test `?action=list` in browser |
| Login redirect error | Add exact Vercel URL to Google OAuth redirect URIs |
| Saves don’t appear in sheet | Redeploy Apps Script; confirm “Execute as: Me” |

---

## Next phase (optional): AI “ask the cloud”

Once the hosted dashboard is stable, we can add a chat panel:

> “I need to increase connectivity — what experiments should I run?”

That uses Claude (enterprise) on the server to search past experiments and suggest the best levers. Say the word when you want that added.
