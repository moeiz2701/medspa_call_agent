# Environment Setup Guide

This guide walks through obtaining every value in [`.env.example`](../.env.example).
Copy it to `.env` first:

```bash
cp .env.example .env
```

Then fill in each variable using the sections below. Variables shown as
`<...>` are placeholders you must replace; anything you generate yourself
should be a long, random string (e.g. `openssl rand -hex 32`).

---

## 1. App basics (no signup needed)

| Variable | Value |
|---|---|
| `NODE_ENV` | `development` locally, `production` when deployed |
| `PORT` | `3001` (the API port; keep in sync with `NEXT_PUBLIC_API_URL`) |
| `LOG_LEVEL` | `info` (use `debug` while troubleshooting) |

---

## 2. Database — Supabase Postgres

`DATABASE_URL`

1. Create an account at <https://supabase.com> and click **New project**.
2. Pick a name, a strong database password (save it), and a region close to your API host.
3. Once the project is provisioned, go to **Project Settings → Database**.
4. Under **Connection string**, select the **URI** tab.
5. Copy the string and replace `[YOUR-PASSWORD]` with the password from step 2.

```
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.<project-ref>.supabase.co:5432/postgres
```

> Tip: for serverless/edge deploys use the **Connection pooling** (port `6543`) string instead.

---

## 3. Demo spa ID

`DEMO_SPA_ID`

This is **not** an external service — it is produced by the seed script after
the database is reachable:

```bash
pnpm seed
```

Copy the UUID printed in the output into `DEMO_SPA_ID`.

---

## 4. Vapi (voice agent)

`VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `VAPI_ASSISTANT_ID`

1. Sign up at <https://vapi.ai> and open the **Dashboard**.
2. **`VAPI_API_KEY`** — go to **API Keys** (or **Account → API Keys**) and copy the **Private** key.
3. **`VAPI_WEBHOOK_SECRET`** — you generate this yourself. Create a long random string:
   ```bash
   openssl rand -hex 32
   ```
   Put the same value here and in the Vapi assistant's **Server / Webhook** settings so Vapi signs requests to your backend.
4. **`VAPI_ASSISTANT_ID`** — leave blank for the first deploy. The deploy script
   creates the assistant and prints its ID; paste it back here and redeploy.

---

## 5. Tool auth secret (self-generated)

`TOOL_AUTH_SECRET`

A shared secret so the backend can verify tool calls coming from Vapi.
Generate and paste a single random string — it is not issued by any provider:

```bash
openssl rand -hex 32
```

---

## 6. Twilio (phone numbers / SMS)

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

1. Create an account at <https://www.twilio.com>.
2. On the **Console** dashboard, copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID` (starts with `AC`)
   - **Auth Token** → `TWILIO_AUTH_TOKEN` (click to reveal)
3. Buy or use a number under **Phone Numbers → Manage → Active numbers**, then
   set `TWILIO_FROM_NUMBER` in E.164 format, e.g. `+15555550100`.

> Trial accounts can only send to verified numbers — upgrade for production use.

---

## 7. Cloudflare R2 (call recording storage)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), open **R2**.
2. **`R2_ACCOUNT_ID`** — shown on the R2 overview page (also in the dashboard URL).
3. Create a bucket (e.g. `medspa-recordings`) → set `R2_BUCKET` to its name.
4. Go to **R2 → Manage R2 API Tokens → Create API token**:
   - Permission: **Object Read & Write**, scoped to your bucket.
   - On creation, copy the **Access Key ID** → `R2_ACCESS_KEY_ID`
   - and the **Secret Access Key** → `R2_SECRET_ACCESS_KEY` (shown only once).

---

## 8. URLs

| Variable | Local | Production |
|---|---|---|
| `DASHBOARD_URL` | `http://localhost:3000` | `https://dashboard.yourdomain.com` |
| `API_BASE_URL` | `http://localhost:3001` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | `https://api.yourdomain.com` |

`API_BASE_URL` must be publicly reachable for Vapi/Twilio webhooks. Locally,
expose it with a tunnel (e.g. `ngrok http 3001`) and use the tunnel URL.

---

## 9. Sentry (optional — error monitoring)

`SENTRY_DSN`

Optional; leave blank to disable.

1. Create a project at <https://sentry.io> (platform: **Node.js**).
2. Go to **Settings → Projects → [project] → Client Keys (DSN)**.
3. Copy the **DSN** into `SENTRY_DSN`.

---

## Final checklist

- [ ] `.env` created from `.env.example`
- [ ] `DATABASE_URL` connects (`pnpm seed` succeeds)
- [ ] `DEMO_SPA_ID` filled from seed output
- [ ] Vapi key set; webhook secret matches the Vapi dashboard
- [ ] `TOOL_AUTH_SECRET` and `VAPI_WEBHOOK_SECRET` are long random strings
- [ ] Twilio SID/token valid; `TWILIO_FROM_NUMBER` in E.164 format
- [ ] R2 bucket exists and API token has read/write
- [ ] URLs point to reachable hosts (tunnel for local webhooks)
- [ ] `VAPI_ASSISTANT_ID` pasted back after first deploy

> Never commit `.env`. Confirm it is listed in [`.gitignore`](../.gitignore).
