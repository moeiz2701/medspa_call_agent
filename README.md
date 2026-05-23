# Med Spa Call Agent — MVP v1

Demo-able voice AI receptionist ("Maya") for U.S. med spas. Caller dials a
Twilio number → Vapi (Deepgram STT + Claude Sonnet 4.5 + ElevenLabs TTS) →
mid-call tool calls to a Fastify backend → fake PMS in Postgres → SMS
confirmation + a real-time dashboard.

Full spec: [`IMPLEMENTATION.md`](IMPLEMENTATION.md). Build log &
deviations: [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Monorepo layout

```
apps/api          Fastify: 5 tool endpoints, Vapi webhook, dashboard REST + SSE
apps/dashboard    Next.js 15: ROI, live call view, calls, bookings, settings
packages/db       Drizzle schema + seed (the fake PMS)
packages/shared   Zod schemas + shared types
packages/prompts  agent-system.md (the agent IP)
infra/vapi        version-controlled assistant.json + deploy script
```

## Prerequisites

- Node ≥ 20, `pnpm` (repo pins `pnpm@10.28.1` via `packageManager`)
- Accounts (free tiers fine): Supabase, Twilio, Vapi, Cloudflare R2; optional Sentry
- Fly.io (backend) + Vercel (dashboard) for deployment

## Local setup

```bash
pnpm install
cp .env.example .env          # then fill in real values

# Database (Supabase connection string in DATABASE_URL)
pnpm db:push                  # create tables
pnpm db:seed                  # seed Aura Med Spa demo data
# → copy the printed DEMO_SPA_ID into .env
```

Run both apps (separate terminals or `pnpm dev` via Turbo):

```bash
pnpm --filter @medspa/api dev        # http://localhost:3001  (/healthz)
pnpm --filter @medspa/dashboard dev  # http://localhost:3000
```

## Environment variables

See [`.env.example`](.env.example) for the full list. Notable:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Supabase Postgres (transaction pooler ok) |
| `DEMO_SPA_ID` | UUID printed by `pnpm db:seed` |
| `TOOL_AUTH_SECRET` | Shared secret Vapi sends as `x-vapi-secret` to tool endpoints |
| `VAPI_WEBHOOK_SECRET` | Shared secret for the `/v1/webhooks/vapi` receiver |
| `R2_PUBLIC_BASE_URL` | *Optional.* r2.dev / custom domain for recordings; if unset, a 7-day presigned URL is stored instead (deviation from guide §9.1) |
| `NEXT_PUBLIC_API_URL` | Dashboard → API base URL |

Generate secrets: `openssl rand -hex 32`

## Vapi + Twilio

1. Buy a US Twilio number with Voice + SMS.
2. Deploy the assistant: `pnpm vapi:deploy` (reads `infra/vapi/assistant.json`,
   injects `packages/prompts/agent-system.md`, rewrites tool URLs to
   `API_BASE_URL`). Set the returned `VAPI_ASSISTANT_ID` in `.env`.
3. In Vapi → Phone Numbers → Import Twilio Number (SID, auth token, number).
   Vapi wires Twilio's voice webhook automatically.

## Deployment

**Backend (Fly.io)** — run from repo root:

```bash
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
fly secrets set DATABASE_URL=... DEMO_SPA_ID=... VAPI_API_KEY=... \
  VAPI_WEBHOOK_SECRET=... TOOL_AUTH_SECRET=... TWILIO_ACCOUNT_SID=... \
  TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=... R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... DASHBOARD_URL=...
```

The API container runs via `tsx` (chosen runtime; see `docs/PROGRESS.md`).

**Dashboard (Vercel):** import the repo, set root to `apps/dashboard`, set
`NEXT_PUBLIC_API_URL`, deploy.

**Database (Supabase):** create a project, then `pnpm db:push && pnpm db:seed`.

## Demo

See `IMPLEMENTATION.md` §15 for the 8–10 min demo script. The live call
view (`/live`) is the closer — the prospect watches their own call
transcript stream in as they speak.

## Status

Phases 1–4 implemented and verified (typecheck/build green). Going "live"
requires the owner's accounts/credentials and the steps above; no real
PMS/payments (deferred to v2 per §16).
