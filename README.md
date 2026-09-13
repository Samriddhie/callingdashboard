# CallDesk — TrueHunt Cat Foods

A calling dashboard: attributed call attempts, a real call-state machine,
mandatory post-call disposition, and note-taking that turns free text into
structured customer/cat facts for review.

Two halves:

- **`src/`** — a Vite + React frontend. Call notes, cat details and call
  history are still stored in the browser's `localStorage` (see
  [Known limits](#known-limits-on-purpose)).
- **`server/`** — an Express backend. It reads the CRM database, verifies
  sign-in, proxies AI note extraction, and in production serves the built
  website too, so one service is the whole app.

**Every data route needs a signed-in user.** The backend serves customer
names, phone numbers and spend; without a session it answers `401`.

## Run it locally

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

To work without Google, add this to `server/.env`:

```
AUTH_DEV_BYPASS=true
```

That turns on a name-only sign-in. It is ignored when `NODE_ENV=production`.
Fill in the rest as you need it:

| Variable | What it's for |
|---|---|
| `CRM_DATABASE`, `CRM_HOST`, `CRM_PORT`, `CRM_USER` | The CRM Postgres the queue and customer pages read |
| `GOOGLE_CLIENT_ID` | Google Sign-In — see [setup](#google-sign-in-setup) |
| `ALLOWED_EMAIL_DOMAIN` | Only accounts on this domain can sign in |
| `ANTHROPIC_API_KEY` | AI note extraction and the pre-call brief |

```bash
node --env-file=.env index.js
```

### 2. Frontend

In a second terminal, from the project root:

```bash
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards every `/api` request to the backend
on port 8787, so the page and the API share an origin just as they do in
production. No `.env.local` is needed.

## Sign-in

Signing in makes the backend set a session cookie, `calldesk_session`. It is
HttpOnly, so page scripts can't read it, and HMAC-signed with
`SESSION_SECRET`, so it can't be forged or edited. It lasts 12 hours. Nothing
about the session is stored in `localStorage`.

| Route | What it does |
|---|---|
| `POST /api/auth/google` | Verifies Google's ID token server-side, checks the email is verified and on `ALLOWED_EMAIL_DOMAIN`, then starts a session |
| `GET /api/auth/me` | Who is signed in, or `401` |
| `POST /api/auth/logout` | Ends the session |
| `POST /api/auth/dev` | Name-only sign-in. `404` unless the server runs with `AUTH_DEV_BYPASS=true` outside production |

`GET /api/health` and the routes above are open. **Everything else under
`/api` requires a session.**

## Google Sign-In setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) →
   create a project (or use an existing one).
2. **APIs & Services → OAuth consent screen** — set it up as Internal if
   your Google Workspace covers `truehunt.store` (simplest, restricts to
   your org automatically); otherwise External + the domain check in
   `server/.env` (`ALLOWED_EMAIL_DOMAIN`) does the restricting instead.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:5173` for
   local work and your deployed site's `https://` URL. Google won't issue a
   token to a page whose origin isn't listed, and it accepts plain `http://`
   only for localhost.
5. Put the client ID in `server/.env` as `GOOGLE_CLIENT_ID`. The page gets it
   from the backend, so the frontend needs no copy. No client secret is
   needed: this flow only ever hands the browser an ID token, which the
   backend verifies.

## AI note extraction setup

1. [console.anthropic.com](https://console.anthropic.com) → **API Keys** →
   **Create Key**.
2. Paste it into `server/.env` as `ANTHROPIC_API_KEY`.
3. Restart the backend.

`src/data/extract.js` already calls `POST /api/extract` and falls back to the
rule-based extractor if that call fails, so there's no frontend config.

`server/index.js` locks the model to a fixed set of allowed field keys
(matching what the review UI knows how to render) and formats values itself
(₹ formatting, date formatting) rather than trusting the model's formatting —
so a stray reply can't hand the frontend a shape it doesn't expect.

## Deploying

### One service (recommended)

The backend serves the built website from `dist/`, so a single Node service
is the whole app. It runs anywhere that runs Node 20+: the planned EC2
server, Render, Railway.

- **Build command:** `npm install --include=dev && npm run build:all`
- **Start command:** `npm start`
- **Environment variables:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `ALLOWED_EMAIL_DOMAIN` | `truehunt.store` |
| `CRM_DATABASE_URL` | A Postgres this server can reach — see [the database](#the-database) |
| `ANTHROPIC_API_KEY`, `SHOPIFY_STORE` | Optional |

In production the server **refuses to start** if `SESSION_SECRET`,
`GOOGLE_CLIENT_ID` or `ALLOWED_EMAIL_DOMAIN` is missing, rather than coming
up with a customer list anyone could read. `AUTH_DEV_BYPASS` is ignored.

Leave `VITE_API_URL` unset: the page calls `/api` on its own origin.

### On Vercel

The repo deploys to Vercel as it is. Vite builds the website, and
`api/index.js` runs the Express backend as a Vercel Function; `vercel.json`
sends every `/api/*` request to it. The backend's packages are listed in the
root `package.json` because that is the only one Vercel installs.

In the Vercel project, open **Settings → Environment Variables** and set:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | 32+ random characters — `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `ALLOWED_EMAIL_DOMAIN` | `truehunt.store` |
| `CRM_DATABASE_URL` | A Postgres Vercel can reach — see [the database](#the-database) |
| `ANTHROPIC_API_KEY`, `SHOPIFY_STORE` | Optional |

Then redeploy: Vercel only applies new variables to new deployments. Also add
the site's URL (e.g. `https://truehuntcallingdashboard.vercel.app`) to the
Google client's **Authorized JavaScript origins**.

Vercel always counts as production, previews included. Until the three
sign-in settings exist, every `/api` route except `/api/health` answers `503`,
and the sign-in screen lists what is missing. You don't need to set `NODE_ENV`.

### Website and backend on different domains

If the website stays on a static host (Netlify, Vercel) and the backend runs
elsewhere:

- **Website build:** set `VITE_API_URL` to the backend's `https://` URL.
- **Backend:** also set `ALLOWED_ORIGIN` to the website's exact URL, and
  `COOKIE_SAMESITE=none`. Browsers only send cross-site cookies over HTTPS,
  so both sides need it.

A static host on its own cannot run the backend.

### The database

The CRM database has to be reachable from wherever the backend runs. A
server on the internet cannot reach a Postgres on someone's laptop, so until
the database is hosted, a deployed backend starts and signs people in but the
queue and customer pages return errors.

## Project layout

```
src/                           React app (Vite)
  auth/AuthContext.jsx           Session — asks the server who is signed in
  components/LoginScreen.jsx     Google, development, or "not configured"
  components/CallModal.jsx       Call state machine + note extraction trigger
  data/api.js                    apiFetch() — every backend request, with the cookie
  data/extract.js                extractFromNote() — AI first, rules as fallback

server/                        Express backend (separate npm project)
  index.js                       Routes, the auth gate, serves dist/ in production
  auth.js                        Signed session cookie, requireAuth
  crm.js, gokwik.js              Read-only CRM queries
  .env.example                   Copy to .env and fill in

migrations/                    Postgres schema the app's own data is moving to
```

## Known limits, on purpose

- **Call data is still per-browser.** Sign-in protects the CRM data the
  backend serves, but call notes, cat details and call history still live in
  `localStorage`, so two employees on two machines see two datasets. The
  `calling` schema in `migrations/` is where that data is moving.
- **The CRM connection is read-only**, so the backend cannot write to those
  tables yet either.
- **No rate limiting.** Worth adding before wider exposure.
