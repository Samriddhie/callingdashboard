# CallDesk — TrueHunt Cat Foods

A calling dashboard: attributed call attempts, a real call-state machine,
mandatory post-call disposition, and note-taking that turns free text into
structured customer/cat facts for review.

The app itself (`src/`) is a Vite + React frontend that stores its data in
the browser's `localStorage` — no database, no server, by design, for a
small internal tool. Two features need more than that, though, and both
live behind a small backend in `server/`:

- **Google Sign-In** — a real identity check needs something that isn't the
  browser to verify the token Google hands back.
- **AI note extraction** — the Anthropic API key can't live in browser
  JavaScript (anyone can read it via DevTools), so the call has to be
  proxied through a server.

If you skip the setup below, the app still runs fine: the login screen
falls back to picking a name from a list, and note extraction falls back to
the original pattern-matching version. Nothing breaks — you just don't get
the upgraded version of either until it's configured.

## Quick start (both features)

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Fill in `server/.env`:

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → see [Google Sign-In setup](#google-sign-in-setup) below |
| `ALLOWED_EMAIL_DOMAIN` | Defaults to `truehunt.store` — only accounts on this domain can sign in |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key |

```bash
npm run dev
```

You should see `CallDesk backend listening on http://localhost:8787`. If
either key is missing it'll warn you but still start — the affected
endpoint just returns an error until you fill it in.

### 2. Frontend

```bash
# from the project root, not server/
cp .env.example .env.local
```

Set `VITE_GOOGLE_CLIENT_ID` in `.env.local` to the **same** client ID you
put in `server/.env`. Then:

```bash
npm install
npm run dev
```

## Google Sign-In setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) →
   create a project (or use an existing one).
2. **APIs & Services → OAuth consent screen** — set it up as Internal if
   your Google Workspace covers `truehunt.store` (simplest, restricts to
   your org automatically); otherwise External + the domain check in
   `server/.env` (`ALLOWED_EMAIL_DOMAIN`) does the restricting instead.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:5173`
   (Vite's dev server). Add your production URL here too once you deploy —
   this list is what Google checks before it'll issue a token to your page.
5. Copy the client ID into both `server/.env` (`GOOGLE_CLIENT_ID`) and
   `.env.local` (`VITE_GOOGLE_CLIENT_ID`). No client secret is needed — this
   flow (Google Identity Services' "Sign In With Google" button) only ever
   hands the browser an ID token, which the backend verifies server-side.

Once both are set and the backend is running, reload the login screen —
the disabled button is replaced by Google's real one.

**What "server-verified" means here:** the browser gets an ID token
straight from Google. That token is a claim until something other than the
browser checks Google's signature on it — `POST /api/auth/google` does
that (via `google-auth-library`), then checks the email ends in
`@truehunt.store` before trusting it. A request forged from DevTools with a
fake token fails at that verification step, not just at a UI check.

## AI note extraction setup

1. [console.anthropic.com](https://console.anthropic.com) → **API Keys** →
   **Create Key**.
2. Paste it into `server/.env` as `ANTHROPIC_API_KEY`.
3. Restart the backend (`npm run dev` in `server/`).

That's the whole setup — `src/data/extract.js` already calls
`POST /api/extract` on the backend and falls back to the old rule-based
extractor if that call fails for any reason, so there's no frontend
config needed.

`server/index.js` locks the model to a fixed set of allowed field keys
(matching what the review UI knows how to render) and formats values
itself (₹ formatting, date formatting) rather than trusting the model's
formatting — so a stray reply can't hand the frontend a shape it doesn't
expect.

## Project layout

```
src/                  React app (Vite)
  auth/AuthContext.jsx        Identity — signIn, signInAsNew, signInWithGoogle
  components/LoginScreen.jsx  Renders Google's button when configured
  components/CallModal.jsx    Call state machine + note extraction trigger
  data/extract.js             extractFromNote() — AI first, rules as fallback
  data/api.js                 API_BASE — where the backend lives

server/               Node/Express backend (separate npm project)
  index.js             POST /api/auth/google, POST /api/extract
  .env.example          Copy to .env and fill in
```

## Running both together

Two terminals:

```bash
# terminal 1
cd server && npm run dev

# terminal 2 (project root)
npm run dev
```

The frontend talks to the backend over plain HTTP at `VITE_API_URL`
(`http://localhost:8787` by default) — there's no build-time coupling
between them, so they can be deployed separately (e.g. frontend on
Vercel/Netlify as a static site, backend as a small Node service anywhere
that can hold an environment variable).

## Known limits, on purpose

- **Data is still per-browser.** Google Sign-In proves who's at the
  keyboard; it doesn't move the call/customer data off `localStorage` onto
  a shared server. Two employees on two machines still see two separate
  datasets. That's a bigger project (a real database) than either feature
  in this README.
- **The backend has no rate limiting or logging beyond `console.error`.**
  Fine for a small internal tool on a private network; worth adding before
  exposing it publicly at scale.
