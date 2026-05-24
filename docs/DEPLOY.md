# Deployment Guide — Fly.io + Vercel + Supabase

End-to-end steps to take this repo from a local-only demo to a public,
persistent, $0/month deployment. After this, anyone with the Vercel URL can
hit "Start call" and run the full pipeline — no laptop, no tunnel.

```
       Vercel (dashboard, free)
              │  HTTPS fetch + SSE
              ▼
Vapi cloud ──► Fly.io (Fastify API, free) ──► Supabase Postgres (free)
(tools +        │
 webhooks)      └── SMS via Twilio (optional)
                └── Recordings via Cloudflare R2 (optional)
```

---

## 0. Prerequisites

- Accounts: GitHub, Vercel, Fly.io, Supabase (and Vapi — already set up).
- `flyctl` installed (Windows, official): `iwr https://fly.io/install.ps1 -useb | iex` — then **open a new PowerShell window** so `PATH` refreshes. Verify with `fly version`.
- The repo pushed to a GitHub repo (Vercel imports from there).
- A working `.env` locally that you've already used to run the demo. You will
  paste most of these values into Fly secrets and Vercel env vars.

The secrets you'll need (have them ready):

| Variable | Where it goes | Notes |
|---|---|---|
| `DATABASE_URL` | Fly | Supabase **Session pooler** URI, port 5432, IPv4 |
| `DEMO_SPA_ID` | Fly | UUID printed by `pnpm db:seed` (one-time) |
| `VAPI_API_KEY` | Fly | Vapi → API Keys → **Private** |
| `VAPI_WEBHOOK_SECRET` | Fly | Any long random string — `openssl rand -hex 32` |
| `TOOL_AUTH_SECRET` | Fly | **Must equal `VAPI_WEBHOOK_SECRET` byte-for-byte** |
| `VAPI_ASSISTANT_ID` | Fly | UUID from `pnpm vapi:deploy` |
| `TWILIO_*` (3 vars) | Fly | Dummy strings OK; SMS no-ops gracefully if invalid |
| `R2_*` (3 vars) | Fly | Dummy strings OK; recording upload no-ops |
| `DASHBOARD_URL` | Fly | Your Vercel URL — gates CORS for SSE |
| `NEXT_PUBLIC_API_URL` | Vercel | Your Fly URL (e.g. `https://medspa-api-xyz.fly.dev`) |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | Vercel | Vapi → API Keys → **Public** (different from private) |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | Vercel | Same UUID as `VAPI_ASSISTANT_ID` |

Optional but recommended:

| Variable | Where | Effect |
|---|---|---|
| `R2_PUBLIC_BASE_URL` | Fly | Plays recordings on `/calls/[id]` without presigning |
| `SENTRY_DSN` | Fly | Error reporting |

---

## 1. Database — Supabase (one-time, already done if you've run locally)

Nothing to deploy. Supabase is already cloud-hosted. Just confirm:

1. Project is **not paused** (free tier pauses after 7 days idle — open it to
   wake; takes ~30s the first time).
2. You're using the **Session pooler** URL (host `aws-0-<region>.pooler.supabase.com`,
   port `5432`, username `postgres.<project-ref>`). Direct connections
   (`db.<ref>.supabase.co`) are IPv6-only and won't work from many hosts.
3. `pnpm db:push` and `pnpm db:seed` were run at least once. `DEMO_SPA_ID`
   is in your local `.env`.

You **do not** re-run these on deploy. The DB is shared between local dev and
production.

---

## 2. Backend — Fly.io

### 2a. First-time launch

From the repo root (where [`apps/api/fly.toml`](../apps/api/fly.toml) is referenced):

```powershell
fly auth login
fly launch --config apps/api/fly.toml --dockerfile apps/api/Dockerfile --no-deploy
```

`fly launch` will:
- Ask if you want to copy the config — say **Yes**.
- Detect the app name `medspa-api` from `fly.toml`. **It's likely already
  taken** — accept Fly's suggestion of a unique name (e.g. `medspa-api-abdul`),
  or pick your own. Fly will update `fly.toml`.
- Ask about a database / Redis — say **No** to both (Supabase + in-memory).
- Skip the deploy with `--no-deploy` so we can set secrets first.

### 2b. Set secrets

Set all of these in one shot — replace the `<...>` placeholders with the
values from your local `.env`. Use a here-string to keep multi-line readable:

```powershell
fly secrets set `
  DATABASE_URL='<your supabase pooler URI>' `
  DEMO_SPA_ID='<uuid>' `
  VAPI_API_KEY='<vapi private key>' `
  VAPI_ASSISTANT_ID='<assistant uuid>' `
  VAPI_WEBHOOK_SECRET='<long random>' `
  TOOL_AUTH_SECRET='<SAME as VAPI_WEBHOOK_SECRET>' `
  TWILIO_ACCOUNT_SID='AC_dummy_or_real' `
  TWILIO_AUTH_TOKEN='dummy_or_real' `
  TWILIO_FROM_NUMBER='+15555550100' `
  R2_ACCOUNT_ID='dummy' `
  R2_ACCESS_KEY_ID='dummy' `
  R2_SECRET_ACCESS_KEY='dummy' `
  R2_BUCKET='medspa-recordings' `
  DASHBOARD_URL='https://placeholder.vercel.app' `
  --config apps/api/fly.toml
```

`DASHBOARD_URL` is a placeholder for now — you'll update it after step 3 when
Vercel gives you the real URL. The API uses this for CORS on the SSE endpoint.

### 2c. Deploy

```powershell
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

First build takes ~3–5 min (cold layers). Subsequent deploys cache and run
in under a minute.

### 2d. Verify

```powershell
$api = (fly status --config apps/api/fly.toml --json | ConvertFrom-Json).Hostname
"https://$api/healthz"
Invoke-WebRequest "https://$api/healthz" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expect `{"ok":true,"ts":"..."}`. Save the `https://<app>.fly.dev` URL —
you'll need it for Vercel and for Vapi.

---

## 3. Frontend — Vercel

### 3a. Import the repo

In the Vercel dashboard:
1. **Add New… → Project → Import** your GitHub repo.
2. **Root Directory**: set to `apps/dashboard`.
3. Framework Preset: **Next.js** (auto-detected).
4. Leave Build / Install / Output blank — [`apps/dashboard/vercel.json`](../apps/dashboard/vercel.json) overrides them to build via Turbo from the monorepo root, so `@medspa/shared`'s `dist/` is produced before the Next build.

### 3b. Environment variables

Under **Settings → Environment Variables**, add (for Production + Preview + Development):

```
NEXT_PUBLIC_API_URL=https://<your-fly-app>.fly.dev
NEXT_PUBLIC_VAPI_PUBLIC_KEY=<Vapi public key>
NEXT_PUBLIC_VAPI_ASSISTANT_ID=<same UUID as VAPI_ASSISTANT_ID>
```

⚠️ `NEXT_PUBLIC_*` vars are **inlined into the browser bundle at build time**.
After changing any of them, you must redeploy (Vercel does this automatically
on save, or hit **Deployments → ⋯ → Redeploy**).

### 3c. Deploy

Click **Deploy**. First build is ~2 min. Vercel gives you
`https://<project>.vercel.app`. Copy it.

---

## 4. Wire the three together

You now have three URLs. Two cross-references must be fixed:

### 4a. Tell the API about the dashboard (CORS)

```powershell
fly secrets set DASHBOARD_URL='https://<your-project>.vercel.app' --config apps/api/fly.toml
```

This triggers a Fly redeploy (~30s). Without it, the dashboard's SSE
connection (`/v1/dashboard/live`) will be blocked by CORS.

### 4b. Tell Vapi about the API (one-time)

Update your **local** `.env` so the deploy script writes the new URL into the
assistant config:

```
API_BASE_URL=https://<your-fly-app>.fly.dev
```

Then push the config to Vapi:

```powershell
pnpm vapi:deploy
```

Expect `✅ Assistant updated: <id>`. This rewrites the assistant's `serverUrl`
(webhooks) and the 5 tool URLs to point at Fly. **You only do this once** —
the Fly URL is stable forever.

---

## 5. Verify end-to-end

Open `https://<your-project>.vercel.app/live`. You should land on the browser
call page (`/live/browser`). Click **Start call**, allow the mic, and book
something with Maya.

Verify each link in the chain:

- **Conversation works** → Vercel ↔ Vapi (web SDK) is fine.
- **Booking lands without "technical issue"** → Fly is reachable, tool auth
  works, DB writes work.
- **`/bookings` shows the new row** → SSE / REST from Vercel to Fly is fine.
- **`/calls/<id>` shows the transcript after the call ends** → webhooks
  reaching Fly, no float-duration crashes.

If any of these break, check `fly logs --config apps/api/fly.toml` — every
request is logged with full error details.

---

## 6. Updates after the first deploy

For day-to-day changes:

| Change | What to do |
|---|---|
| Code in `apps/api/` or `packages/db`, `packages/shared` | `fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile` |
| Code in `apps/dashboard/` | Push to GitHub — Vercel auto-deploys |
| `packages/prompts/agent-system.md` or `infra/vapi/assistant.json` | `pnpm vapi:deploy` (and that's it — no Fly/Vercel deploy needed) |
| New env var on API | `fly secrets set FOO=bar --config apps/api/fly.toml` (auto-redeploys) |
| New `NEXT_PUBLIC_*` var | Add in Vercel UI → click Redeploy |
| Schema change | Locally: `pnpm db:push`. The deployed API picks it up on its next request — no Fly redeploy needed for pure DDL changes; redeploy if you changed `schema.ts`. |

---

## 7. Free-tier limits and pitfalls

**Fly.io**: 3 shared-cpu-1x 256MB machines free (we use 1 × 512MB, which costs
~$0 against the free allowance). With `min_machines_running = 1` and
`auto_stop_machines = false`, the API never cold-starts — important for SSE.

**Vercel**: Hobby plan is generous; no concerns at demo scale.

**Supabase**: Auto-pauses after 7 days of zero queries. Keep it warm by hitting
any endpoint that queries the DB once a day (a cron in Vapi, GitHub Actions,
or just open the dashboard).

**Cloudflare quick-tunnel**: No longer needed — Fly gives you a permanent
`*.fly.dev` URL. The `dev:demo` script and `scripts/dev-demo.ps1` are still
useful for local development; not for production.

---

## 8. Known caveats

- **`TOOL_AUTH_SECRET` must equal `VAPI_WEBHOOK_SECRET`.** The deploy script
  ([`infra/vapi/deploy.ts`](../infra/vapi/deploy.ts)) only sets the assistant-level
  `serverUrlSecret`; tools fall back to it, but the tool route validates
  against `TOOL_AUTH_SECRET`. Mismatch → every booking returns 401.
- **`DEMO_SPA_ID` must match the seed.** If you re-run `pnpm db:seed` it
  creates a new spa with a new UUID — update the Fly secret.
- **Web calls have no `customer.number`.** Handled in
  [`create-appointment.ts`](../apps/api/src/tools/create-appointment.ts) — the
  client row gets `web:<vapi-call-id>` as a synthetic phone, SMS skipped.
- **Twilio/R2 with dummy values**: booking + dashboard work fully; SMS
  delivery and recording playback just no-op silently.
