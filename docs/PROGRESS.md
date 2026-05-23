# Build Progress

Source of truth: [`IMPLEMENTATION.md`](../IMPLEMENTATION.md). Built phase-by-phase per §14.

---

## ✅ Phase 1 — Monorepo skeleton (DONE)

Maps to **Week 1, Day 1-3** of the build plan.

Delivered & verified (`@medspa/db` + `@medspa/shared` compile clean):

- Root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- `packages/db`: Drizzle `schema.ts`, `client.ts` (postgres-js), `seed.ts`, `drizzle.config.ts`
- `packages/shared`: domain `types.ts`, Vapi `schemas.ts`, barrel `index.ts`
- `packages/prompts`: `agent-system.md` (the agent IP, §7)
- `infra/vapi`: `assistant.json` (§6.1), `deploy.ts` (§6.2)

Deviations from guide (documented):
- `seed.ts` / `drizzle.config.ts` / `deploy.ts` load repo-root `.env` explicitly and are ESM/tsx-safe.
- DB package exports compiled `dist` (build ordering handled by Turbo `^build`) instead of raw `.ts`.

Not done in Phase 1 (requires external accounts — owner action, per §11/§12/§13):
- Supabase project + real `DATABASE_URL`, Twilio number, Vapi account, R2 bucket, running `db:push`/`db:seed`.

---

## ✅ Phase 2 — Backend (DONE)

`apps/api` fully implemented; `@medspa/api typecheck` passes clean (deps + db/shared built).

Deviations from guide (fix-as-I-go, approved):
- **§8.8 `logToolCall`**: now persists `success` and `errorMessage` (guide accepted but dropped them). `create_appointment` failure path passes `errorMessage`.
- **§9.1 `downloadRecording`**: guide stored a non-fetchable `*.r2.cloudflarestorage.com` URL. Now stores the configured public base URL (`R2_PUBLIC_BASE_URL`, new optional env) or a 7-day presigned GET URL (`@aws-sdk/s3-request-presigner` added).
- **Typed payloads**: replaced `req: any` in every tool, webhook, and dashboard route with `@medspa/shared`'s `VapiToolRequestSchema` / a typed webhook interface.
- **`apps/api/src/db.ts`**: thin re-export of `@medspa/db/client` so the guide's `../db` imports resolve to one client.
- **server.ts**: error handler param typed (`Error & { statusCode? }`) to satisfy Fastify v5.
- **Dashboard**: split into `dashboard/{stats,calls,bookings,live}.ts` + `index.ts` per the §2.3 tree (guide §10.2 showed them combined — identical routes/behavior).
- **Runtime**: API runs via `tsx` (dev `start`); production bundling deferred to Phase 4.

Owner action still required before live calls: real `.env` (Supabase/Twilio/Vapi/R2), `db:push`, `db:seed`, `vapi:deploy`.

---

## ✅ Phase 3 — Dashboard (DONE)

`apps/dashboard` implemented; `next build` passes (8 routes compiled, types valid, lint clean).

Deviations from guide (approved):
- **No Clerk auth** (guide §3.2): single shared demo spa, no auth-bearing data, no keys. `(dashboard)/layout.tsx` carries a documented AUTH SEAM comment for dropping Clerk in later. No `(auth)/sign-in` route.
- **Settings page**: guide gives no code and exposes no settings-write API. Built as a read-only reference card mirroring the seeded spa (v1.5 makes it editable).
- **Bookings page**: built from the documented `/v1/dashboard/bookings` shape (guide listed the route only).
- Added root `app/layout.tsx` + `QueryProvider` + `sonner` Toaster (required by App Router; guide showed only the `(dashboard)` group).
- `next.config.mjs`: `outputFileTracingRoot` pinned to repo root so Vercel doesn't pick a stray parent lockfile.

---

## ✅ Phase 4 — Deployment & docs (DONE)

Delivered: `apps/api/Dockerfile` (tsx runtime, repo-root build context),
root `.dockerignore`, `apps/api/fly.toml`, `README.md` runbook.

**Final verification:** `pnpm turbo run build` → 4/4 packages succeed;
`@medspa/api` + `@medspa/dashboard` `tsc --noEmit` both clean.

Deviations: Dockerfile runs `pnpm --filter @medspa/api start` (tsx) instead
of `node dist/server.js` (chosen runtime); `.dockerignore` lives at repo root
because the build context is the repo root, not `apps/api`.

### Owner action to go live (no creds available here)
1. Fill `.env` (Supabase, Twilio, Vapi, R2).
2. `pnpm db:push && pnpm db:seed` → set `DEMO_SPA_ID`.
3. `fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile` + `fly secrets set ...`
4. Vercel import (root `apps/dashboard`, set `NEXT_PUBLIC_API_URL`).
5. `pnpm vapi:deploy` → set `VAPI_ASSISTANT_ID`; import Twilio number in Vapi.

---

## (archived plan below)

Maps to **Week 4** (deploy + polish — infra/docs only; live calls need owner accounts).

### Scope
| File | Source § | Purpose |
|---|---|---|
| `apps/api/Dockerfile` | §12.1 | Backend container for Fly.io |
| `apps/api/.dockerignore` | — | Slim build context |
| `apps/api/fly.toml` | §12.1 | Fly.io service config |
| `README.md` | §11–13 | Setup, env, deploy, demo runbook |
| root `package.json` | — | add `start`/deploy convenience scripts if needed |

### Decisions / planned deviations
- **API runtime in prod**: see chat question. The guide's Dockerfile runs `node apps/api/dist/server.js`, but our API uses extensionless ESM imports (runs via `tsx`). Two options below.
- No live deploy performed (no Fly/Vercel/Supabase creds) — deliver verified, deployable config + a runbook. Owner runs `fly deploy`, Vercel import, `db:push`, `db:seed`, `vapi:deploy`.
- Final verification: full `turbo run build` + per-app typecheck green.
