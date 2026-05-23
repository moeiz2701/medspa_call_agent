// apps/api/src/env.ts
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

// Load repo-root .env regardless of cwd (Turbo runs from repo root,
// direct `tsx` runs from apps/api). On Fly.io real env vars win.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().url(),
  DEMO_SPA_ID: z.string().uuid(),
  VAPI_API_KEY: z.string(),
  VAPI_WEBHOOK_SECRET: z.string(),
  TOOL_AUTH_SECRET: z.string(),  // For Vapi → backend auth
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_FROM_NUMBER: z.string(),
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string().default('medspa-recordings'),
  // Deviation from guide §9.1: the guide built a non-resolvable R2 URL.
  // If a public base (r2.dev / custom domain) is set we use it; otherwise
  // recordings are served via a presigned GET URL.
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  DASHBOARD_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),
});

export const env = Env.parse(process.env);
