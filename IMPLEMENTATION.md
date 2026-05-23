# Med Spa Call Agent — MVP v1 Implementation Guide

**Goal:** Build a working, demo-able voice AI call agent for U.S. med spas that can be shown to prospects to close deals. No real PMS integration. No payments. Fake spa data in our own database.

**Target timeline:** 4 weeks (one developer)
**Voice stack:** Vapi + Twilio + Claude Sonnet 4.5 + ElevenLabs + Deepgram
**Code stack:** Node.js / TypeScript / Fastify backend + Next.js 15 dashboard + Postgres

---

## Table of Contents

1. [Scope and Goals](#1-scope-and-goals)
2. [Architecture Overview](#2-architecture-overview)
3. [The Stack (Precise Versions)](#3-the-stack-precise-versions)
4. [The Demo Database (Fake PMS)](#4-the-demo-database-fake-pms)
5. [Backend Implementation](#5-backend-implementation)
6. [Vapi Configuration](#6-vapi-configuration)
7. [The System Prompt](#7-the-system-prompt)
8. [Tool Endpoints (Deep Dive)](#8-tool-endpoints-deep-dive)
9. [Webhook Handlers](#9-webhook-handlers)
10. [The Dashboard](#10-the-dashboard)
11. [Twilio Setup](#11-twilio-setup)
12. [Deployment](#12-deployment)
13. [Environment Variables](#13-environment-variables)
14. [4-Week Build Plan](#14-4-week-build-plan)
15. [Demo Script](#15-demo-script)
16. [Post-MVP Roadmap](#16-post-mvp-roadmap)

---

## 1. Scope and Goals

### 1.1 What this MVP is

A working voice AI call agent demo that runs on real telephony with a real LLM, backed by a fake spa database that stands in for a real PMS like Boulevard or Mindbody. The goal is **sales-ready demo**, not production multi-tenant SaaS.

### 1.2 What this MVP is NOT

- ❌ No real PMS integration (Boulevard, Mindbody, Vagaro) — deferred to v2
- ❌ No payment integration (Stripe, Boulevard Payments) — deferred to v2
- ❌ No Cal.com integration — deferred to v2
- ❌ No outbound calls / reactivation campaigns — deferred to v2
- ❌ No Spanish or multi-language — deferred to v2
- ❌ No HIPAA BAAs with vendors — demo only, no real PHI
- ❌ No multi-tenancy yet — single shared demo spa
- ❌ No white-label or per-spa branding

### 1.3 Success criteria

The MVP is done when all of the following work end-to-end:

1. Prospect dials a public Twilio number, agent answers within 3 rings
2. Agent greets as "Aura Med Spa," handles a booking request for a real service (Botox, filler, facial)
3. Agent queries the demo DB for availability, offers two specific slots
4. Agent confirms and creates the booking in the demo DB
5. SMS confirmation arrives at the caller's number within 10 seconds
6. Booking appears in the dashboard immediately
7. Transcript + recording available in the dashboard within 30 seconds of call end
8. **The "live call" view in the dashboard updates in real-time during a call** — this is the demo wow moment
9. Voice quality and latency are good enough that a med spa owner says "that sounds like a real receptionist"

### 1.4 Out-of-scope edge cases (graceful fallback only)

| Caller intent | MVP behavior |
|---|---|
| Reschedule/cancel existing appointment | Agent: "Let me transfer you to our team" → warm transfer |
| Asks medical advice ("is Botox safe for me?") | Deflect: "Great question for one of our nurses — want to book a free consultation?" |
| Speaks Spanish | "One moment, transferring you" → warm transfer |
| Angry / complaint | Transfer to human |
| Pregnancy / breastfeeding mentioned | Deflect to consultation, do not offer treatment booking |
| Pricing questions on specifics | "Pricing depends on units — your injector confirms at consultation; consultations are free" |

None of these need to be solved cleverly. They just need to fail with dignity.

---

## 2. Architecture Overview

### 2.1 Mental model

**You don't build the agent. You configure it in Vapi.** What you actually write is:

- A **backend** (Fastify) that exposes "tool" endpoints Vapi calls during conversations + webhook receivers + a REST API for the dashboard
- A **dashboard** (Next.js) that reads from the backend
- A **fake PMS adapter** (`DemoDbAdapter`) that conforms to the interface a real `BoulevardAdapter` will use in v2

The agent's "intelligence" lives in two places: the **system prompt** (your IP) and the **tools** it can call (your code).

### 2.2 System flow

```
Caller dials Twilio number
   │
   ▼
Twilio (PSTN → SIP)
   │
   ▼
Vapi
   ├─ Deepgram STT
   ├─ Claude Sonnet 4.5
   └─ ElevenLabs TTS
   │
   │ Mid-call: HTTPS POST tool calls
   ▼
Your Fastify Backend (Fly.io)
   ├─ /v1/tools/lookup_client
   ├─ /v1/tools/list_services
   ├─ /v1/tools/get_availability
   ├─ /v1/tools/create_appointment
   ├─ /v1/tools/transfer_to_human
   ├─ /v1/webhooks/vapi          ← call.started, call.ended, tool calls
   └─ /v1/dashboard/*            ← read API for dashboard
   │
   ├─→ Postgres (Supabase): spa, services, providers, clients,
   │                        appointments, calls, transcripts
   ├─→ Cloudflare R2: recording audio files
   ├─→ Twilio API: send SMS confirmations
   └─→ Server-Sent Events: pushes live call updates to dashboard

Next.js Dashboard (Vercel)
   └─→ Reads backend REST API + subscribes to SSE for live view
```

### 2.3 Repository layout

Single monorepo using pnpm workspaces + Turborepo.

```
medspa-agent/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── env.ts
│   │   │   ├── db.ts
│   │   │   ├── tools/
│   │   │   │   ├── index.ts
│   │   │   │   ├── lookup-client.ts
│   │   │   │   ├── list-services.ts
│   │   │   │   ├── get-availability.ts
│   │   │   │   ├── create-appointment.ts
│   │   │   │   └── transfer-to-human.ts
│   │   │   ├── webhooks/
│   │   │   │   └── vapi.ts
│   │   │   ├── dashboard/
│   │   │   │   ├── calls.ts
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── stats.ts
│   │   │   │   └── live.ts     # SSE endpoint
│   │   │   ├── lib/
│   │   │   │   ├── sms.ts
│   │   │   │   ├── recordings.ts
│   │   │   │   ├── auth.ts
│   │   │   │   └── events.ts   # In-memory pub/sub for SSE
│   │   │   └── adapters/
│   │   │       ├── types.ts    # PMSAdapter interface
│   │   │       └── demo-db.ts  # The fake PMS
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── dashboard/              # Next.js 15
│       ├── app/
│       │   ├── (auth)/sign-in/
│       │   └── (dashboard)/
│       │       ├── layout.tsx
│       │       ├── page.tsx        # Home / ROI dashboard
│       │       ├── live/           # Live call view (demo gold)
│       │       ├── calls/          # Call log + detail
│       │       ├── bookings/       # Bookings table
│       │       └── settings/
│       ├── components/
│       ├── lib/
│       ├── package.json
│       └── tailwind.config.ts
├── packages/
│   ├── db/                     # Drizzle schema + seed
│   │   ├── schema.ts
│   │   ├── seed.ts
│   │   └── package.json
│   ├── prompts/
│   │   └── agent-system.md
│   └── shared/                 # Zod schemas, types
│       ├── src/
│       │   ├── types.ts
│       │   └── schemas.ts
│       └── package.json
├── infra/
│   └── vapi/
│       ├── assistant.json      # Vapi assistant config
│       └── deploy.ts           # Script to push config to Vapi
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 2.4 Process model

- **1 process in production for backend:** Fastify on Fly.io
- **1 process for dashboard:** Next.js on Vercel
- **No worker yet:** No BullMQ, no Inngest. SMS sending and recording downloads happen inline or via `setImmediate`. Add a worker in v2 when outbound campaigns arrive.

---

## 3. The Stack (Precise Versions)

### 3.1 External services

| Service | Purpose | MVP cost |
|---|---|---|
| Twilio | Phone number + voice + SMS | ~$1/mo per number, $0.013/min voice, $0.0079/SMS |
| Vapi | Voice orchestration | ~$0.05/min + LLM/TTS passthrough (~$0.15/min total) |
| Anthropic (via Vapi) | Claude Sonnet 4.5 | ~$0.003/short call |
| ElevenLabs (via Vapi) | TTS voice | ~$0.10/min |
| Deepgram (via Vapi) | STT | included |
| Supabase | Postgres | Free tier sufficient |
| Cloudflare R2 | Audio storage | Free tier (10GB, no egress) |
| Fly.io | Backend hosting | $5-10/mo |
| Vercel | Dashboard hosting | Free tier |
| Clerk | Dashboard auth | Free up to 10K MAU |
| Sentry | Error monitoring | Free tier |
| PostHog | Product analytics | Free tier |

**Total monthly fixed cost for MVP demo:** ~$10–20/mo plus per-minute call usage.

### 3.2 Code dependencies

```json
{
  "backend": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/sensible": "^6.0.0",
    "fastify-type-provider-zod": "^4.0.0",
    "drizzle-orm": "^0.36.0",
    "drizzle-kit": "^0.28.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "twilio": "^5.0.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "@sentry/node": "^8.0.0",
    "date-fns": "^4.0.0",
    "date-fns-tz": "^3.0.0",
    "dotenv": "^16.0.0"
  },
  "dashboard": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@clerk/nextjs": "^6.0.0",
    "@tanstack/react-query": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.400.0",
    "date-fns": "^4.0.0",
    "recharts": "^2.0.0",
    "sonner": "^1.5.0"
  }
}
```

---

## 4. The Demo Database (Fake PMS)

### 4.1 Why the fake DB matters

This is the most important architectural decision in the MVP. The `DemoDbAdapter` implements the same interface a future `BoulevardAdapter` will. When v2 ships, you swap one class — nothing else changes. The system prompt doesn't change, the tool endpoints don't change, the dashboard doesn't change.

### 4.2 Drizzle schema

```typescript
// packages/db/schema.ts
import {
  pgTable, uuid, text, timestamp, integer,
  boolean, jsonb, real, varchar, pgEnum
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const callDirectionEnum = pgEnum('call_direction', ['inbound', 'outbound']);
export const callOutcomeEnum = pgEnum('call_outcome', [
  'booked', 'transferred', 'info_only', 'voicemail', 'failed', 'in_progress'
]);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'scheduled', 'completed', 'cancelled', 'no_show'
]);

// The demo spa (only one row for MVP)
export const spas = pgTable('spas', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),               // "America/New_York"
  phoneNumber: text('phone_number').notNull(),        // E.164 Twilio number
  transferNumber: text('transfer_number'),            // For warm transfers
  address: text('address'),
  hoursJson: jsonb('hours_json').notNull(),           // { mon: {open:"09:00", close:"18:00"}, ... }
  vapiAssistantId: text('vapi_assistant_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Services offered
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaId: uuid('spa_id').notNull().references(() => spas.id),
  name: text('name').notNull(),                       // "Botox - Lip Flip"
  category: text('category').notNull(),               // injectables | laser | facial | body | wellness
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull(),
  priceFrom: real('price_from'),                      // For "starting at" quotes
  priceTo: real('price_to'),
  priceUnit: text('price_unit'),                      // "per unit", "per session", "flat"
  requiresConsult: boolean('requires_consult').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
});

// Providers (injectors, estheticians)
export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaId: uuid('spa_id').notNull().references(() => spas.id),
  name: text('name').notNull(),                       // "Jessica Martinez, NP"
  title: text('title'),                               // "Nurse Injector"
  bio: text('bio'),
  active: boolean('active').default(true).notNull(),
});

// Which providers can do which services (many-to-many)
export const providerServices = pgTable('provider_services', {
  providerId: uuid('provider_id').notNull().references(() => providers.id),
  serviceId: uuid('service_id').notNull().references(() => services.id),
});

// Provider weekly schedule (simple — same hours every week)
export const providerSchedules = pgTable('provider_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').notNull().references(() => providers.id),
  dayOfWeek: integer('day_of_week').notNull(),        // 0=Sun..6=Sat
  startTime: text('start_time').notNull(),            // "09:00"
  endTime: text('end_time').notNull(),                // "17:00"
});

// Clients
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaId: uuid('spa_id').notNull().references(() => spas.id),
  phone: text('phone').notNull(),                     // E.164
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email'),
  preferredProviderId: uuid('preferred_provider_id').references(() => providers.id),
  vipFlag: boolean('vip_flag').default(false),
  notes: text('notes'),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
});

// Appointments
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaId: uuid('spa_id').notNull().references(() => spas.id),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  serviceId: uuid('service_id').notNull().references(() => services.id),
  providerId: uuid('provider_id').notNull().references(() => providers.id),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  status: appointmentStatusEnum('status').default('scheduled').notNull(),
  estimatedValue: real('estimated_value'),            // For ROI calculations
  createdViaCallId: uuid('created_via_call_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Calls
export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaId: uuid('spa_id').notNull().references(() => spas.id),
  vapiCallId: text('vapi_call_id').unique(),
  direction: callDirectionEnum('direction').notNull(),
  fromNumber: text('from_number').notNull(),
  toNumber: text('to_number').notNull(),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  outcome: callOutcomeEnum('outcome').default('in_progress').notNull(),
  recordingUrl: text('recording_url'),                // R2 URL
  transcriptUrl: text('transcript_url'),
  summary: text('summary'),
  costUsd: real('cost_usd'),
  appointmentId: uuid('appointment_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Per-turn transcript for the live call view
export const callTranscripts = pgTable('call_transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => calls.id),
  role: text('role').notNull(),                       // 'user' | 'assistant' | 'tool'
  content: text('content').notNull(),
  toolName: text('tool_name'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Tool call log (for debugging + dashboard)
export const toolCalls = pgTable('tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => calls.id),
  toolName: text('tool_name').notNull(),
  argsJson: jsonb('args_json'),
  resultJson: jsonb('result_json'),
  durationMs: integer('duration_ms'),
  success: boolean('success').default(true).notNull(),
  errorMessage: text('error_message'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
```

### 4.3 Seed data (the demo spa)

The demo spa should feel **real and impressive**. Spend an hour on this — it's what prospects will see.

```typescript
// packages/db/seed.ts
import { db } from './client';
import * as s from './schema';

async function seed() {
  console.log('🌱 Seeding demo data...');

  // The spa
  const [spa] = await db.insert(s.spas).values({
    name: 'Aura Med Spa',
    timezone: 'America/New_York',
    phoneNumber: '+15555550100',  // Your real Twilio number
    transferNumber: '+15555550101',
    address: '142 Greene Street, New York, NY 10012',
    hoursJson: {
      mon: { open: '09:00', close: '19:00' },
      tue: { open: '09:00', close: '19:00' },
      wed: { open: '09:00', close: '19:00' },
      thu: { open: '09:00', close: '20:00' },
      fri: { open: '09:00', close: '20:00' },
      sat: { open: '10:00', close: '18:00' },
      sun: null,  // Closed
    },
  }).returning();

  // Services — a realistic med spa menu
  const serviceData = [
    // Injectables
    { name: 'Botox - Full Treatment',  category: 'injectables', durationMinutes: 30, priceFrom: 14, priceTo: 18, priceUnit: 'per unit', requiresConsult: false },
    { name: 'Botox - Lip Flip',         category: 'injectables', durationMinutes: 30, priceFrom: 80, priceTo: 120, priceUnit: 'flat', requiresConsult: false },
    { name: 'Lip Filler',                category: 'injectables', durationMinutes: 60, priceFrom: 650, priceTo: 900, priceUnit: 'per syringe', requiresConsult: true },
    { name: 'Cheek Filler',              category: 'injectables', durationMinutes: 60, priceFrom: 750, priceTo: 1100, priceUnit: 'per syringe', requiresConsult: true },
    { name: 'Injectable Consultation',   category: 'injectables', durationMinutes: 30, priceFrom: 0,  priceTo: 0,    priceUnit: 'free',   requiresConsult: false },
    // Lasers
    { name: 'IPL Photofacial',           category: 'laser',       durationMinutes: 45, priceFrom: 350, priceTo: 450, priceUnit: 'flat',   requiresConsult: false },
    { name: 'Laser Hair Removal - Small Area', category: 'laser', durationMinutes: 30, priceFrom: 150, priceTo: 250, priceUnit: 'flat',   requiresConsult: false },
    // Facials
    { name: 'HydraFacial Signature',     category: 'facial',      durationMinutes: 50, priceFrom: 199, priceTo: 199, priceUnit: 'flat',   requiresConsult: false },
    { name: 'HydraFacial Deluxe',        category: 'facial',      durationMinutes: 75, priceFrom: 299, priceTo: 299, priceUnit: 'flat',   requiresConsult: false },
    { name: 'Chemical Peel',             category: 'facial',      durationMinutes: 45, priceFrom: 175, priceTo: 350, priceUnit: 'flat',   requiresConsult: false },
    // Body
    { name: 'CoolSculpting Consultation', category: 'body',       durationMinutes: 30, priceFrom: 0,   priceTo: 0,   priceUnit: 'free',   requiresConsult: false },
    // Wellness
    { name: 'IV Hydration Drip',         category: 'wellness',    durationMinutes: 45, priceFrom: 175, priceTo: 250, priceUnit: 'flat',   requiresConsult: false },
  ];
  const insertedServices = await db.insert(s.services)
    .values(serviceData.map(svc => ({ ...svc, spaId: spa.id })))
    .returning();

  // Providers
  const providerData = [
    { name: 'Jessica Martinez, NP',  title: 'Lead Nurse Injector',  bio: 'Specializes in lips and natural-looking results. 8 years of experience.' },
    { name: 'Dr. Aaron Chen, MD',    title: 'Medical Director',     bio: 'Board-certified physician overseeing all injectable treatments.' },
    { name: 'Maya Patel, LE',        title: 'Senior Esthetician',   bio: 'HydraFacial expert and chemical peel specialist.' },
    { name: 'Sophie Williams, RN',   title: 'Laser Specialist',     bio: 'IPL and laser hair removal certified.' },
  ];
  const insertedProviders = await db.insert(s.providers)
    .values(providerData.map(p => ({ ...p, spaId: spa.id })))
    .returning();

  // Provider ↔ service mapping
  const [jessica, aaron, maya, sophie] = insertedProviders;
  const svcByName = Object.fromEntries(insertedServices.map(s => [s.name, s]));

  const mappings = [
    // Injectables: Jessica + Aaron
    [jessica, ['Botox - Full Treatment', 'Botox - Lip Flip', 'Lip Filler', 'Cheek Filler', 'Injectable Consultation']],
    [aaron,   ['Botox - Full Treatment', 'Lip Filler', 'Cheek Filler', 'Injectable Consultation']],
    // Facials & peels: Maya
    [maya,    ['HydraFacial Signature', 'HydraFacial Deluxe', 'Chemical Peel']],
    // Lasers: Sophie
    [sophie,  ['IPL Photofacial', 'Laser Hair Removal - Small Area']],
    // Wellness + body consults: shared
    [jessica, ['IV Hydration Drip', 'CoolSculpting Consultation']],
    [maya,    ['IV Hydration Drip']],
  ];

  for (const [provider, services] of mappings) {
    for (const svcName of services as string[]) {
      await db.insert(s.providerServices).values({
        providerId: (provider as any).id,
        serviceId: svcByName[svcName].id,
      });
    }
  }

  // Schedules (Mon-Fri standard)
  for (const provider of insertedProviders) {
    for (let day = 1; day <= 5; day++) {
      await db.insert(s.providerSchedules).values({
        providerId: provider.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '18:00',
      });
    }
    // Saturday for Jessica + Maya
    if (provider.id === jessica.id || provider.id === maya.id) {
      await db.insert(s.providerSchedules).values({
        providerId: provider.id,
        dayOfWeek: 6,
        startTime: '10:00',
        endTime: '17:00',
      });
    }
  }

  // A few sample clients so "returning client" demos work
  await db.insert(s.clients).values([
    {
      spaId: spa.id,
      phone: '+15555551234',  // Use your own phone here for demos!
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah@example.com',
      preferredProviderId: jessica.id,
      vipFlag: true,
      notes: 'Prefers natural lip filler results. Sensitive to lidocaine.',
    },
  ]);

  console.log('✅ Demo data seeded');
  console.log(`   Spa: ${spa.name} (${spa.id})`);
  console.log(`   ${insertedServices.length} services, ${insertedProviders.length} providers`);
}

seed().catch(console.error).finally(() => process.exit(0));
```

### 4.4 The adapter interface

```typescript
// apps/api/src/adapters/types.ts
export interface PMSAdapter {
  lookupClient(spaId: string, phone: string): Promise<ClientInfo | null>;
  upsertClient(spaId: string, input: ClientUpsertInput): Promise<ClientInfo>;
  listServices(spaId: string, opts?: { category?: string }): Promise<ServiceInfo[]>;
  listProviders(spaId: string, opts?: { serviceId?: string }): Promise<ProviderInfo[]>;
  getAvailability(input: AvailabilityQuery): Promise<TimeSlot[]>;
  createAppointment(input: AppointmentInput): Promise<AppointmentInfo>;
}

export interface ClientInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  preferredProviderId: string | null;
  preferredProviderName?: string | null;
  vipFlag: boolean;
  lastVisitDate?: Date | null;
  notes: string | null;
}

export interface ServiceInfo {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  priceFrom: number | null;
  priceTo: number | null;
  priceUnit: string | null;
  requiresConsult: boolean;
  description: string | null;
}

export interface ProviderInfo {
  id: string;
  name: string;
  title: string | null;
}

export interface AvailabilityQuery {
  spaId: string;
  serviceId: string;
  providerId?: string;
  rangeStart: Date;
  rangeEnd: Date;
  maxSlots?: number;
}

export interface TimeSlot {
  startsAt: Date;
  endsAt: Date;
  providerId: string;
  providerName: string;
}

export interface AppointmentInput {
  spaId: string;
  clientId: string;
  serviceId: string;
  providerId: string;
  startsAt: Date;
  callId?: string;
}

export interface AppointmentInfo {
  id: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  providerName: string;
  clientName: string;
}

export interface ClientUpsertInput {
  spaId: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}
```

### 4.5 DemoDbAdapter implementation (the fake PMS)

```typescript
// apps/api/src/adapters/demo-db.ts
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { addMinutes, startOfDay, endOfDay, isSameDay, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { PMSAdapter, AvailabilityQuery, TimeSlot } from './types';

const SLOT_GRANULARITY_MIN = 15;  // Slots start every 15 min

export class DemoDbAdapter implements PMSAdapter {
  async lookupClient(spaId: string, phone: string) {
    const result = await db.select({
      client: s.clients,
      providerName: s.providers.name,
    })
      .from(s.clients)
      .leftJoin(s.providers, eq(s.clients.preferredProviderId, s.providers.id))
      .where(and(eq(s.clients.spaId, spaId), eq(s.clients.phone, phone)))
      .limit(1);

    if (result.length === 0) return null;
    const r = result[0];
    return {
      id: r.client.id,
      firstName: r.client.firstName,
      lastName: r.client.lastName,
      phone: r.client.phone,
      preferredProviderId: r.client.preferredProviderId,
      preferredProviderName: r.providerName,
      vipFlag: r.client.vipFlag ?? false,
      notes: r.client.notes,
    };
  }

  async upsertClient(spaId: string, input: { phone: string; firstName?: string; lastName?: string; email?: string }) {
    const existing = await this.lookupClient(spaId, input.phone);
    if (existing) {
      await db.update(s.clients)
        .set({
          firstName: input.firstName ?? existing.firstName,
          lastName: input.lastName ?? existing.lastName,
          email: input.email,
          lastSeenAt: new Date(),
        })
        .where(eq(s.clients.id, existing.id));
      return (await this.lookupClient(spaId, input.phone))!;
    }
    const [created] = await db.insert(s.clients).values({
      spaId,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
    }).returning();
    return (await this.lookupClient(spaId, created.phone))!;
  }

  async listServices(spaId: string, opts: { category?: string } = {}) {
    const conditions = [eq(s.services.spaId, spaId), eq(s.services.active, true)];
    if (opts.category) conditions.push(eq(s.services.category, opts.category));
    const rows = await db.select().from(s.services).where(and(...conditions));
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      durationMinutes: r.durationMinutes,
      priceFrom: r.priceFrom,
      priceTo: r.priceTo,
      priceUnit: r.priceUnit,
      requiresConsult: r.requiresConsult,
      description: r.description,
    }));
  }

  async listProviders(spaId: string, opts: { serviceId?: string } = {}) {
    if (opts.serviceId) {
      const rows = await db.select({ provider: s.providers })
        .from(s.providers)
        .innerJoin(s.providerServices, eq(s.providerServices.providerId, s.providers.id))
        .where(and(
          eq(s.providers.spaId, spaId),
          eq(s.providers.active, true),
          eq(s.providerServices.serviceId, opts.serviceId),
        ));
      return rows.map(r => ({ id: r.provider.id, name: r.provider.name, title: r.provider.title }));
    }
    const rows = await db.select().from(s.providers)
      .where(and(eq(s.providers.spaId, spaId), eq(s.providers.active, true)));
    return rows.map(r => ({ id: r.id, name: r.name, title: r.title }));
  }

  async getAvailability(q: AvailabilityQuery): Promise<TimeSlot[]> {
    const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, q.spaId));
    if (!spa) throw new Error('Spa not found');
    const tz = spa.timezone;

    const [service] = await db.select().from(s.services).where(eq(s.services.id, q.serviceId));
    if (!service) throw new Error('Service not found');

    // Which providers can do this service?
    const eligibleProviders = await this.listProviders(q.spaId, { serviceId: q.serviceId });
    const providers = q.providerId
      ? eligibleProviders.filter(p => p.id === q.providerId)
      : eligibleProviders;

    const slots: TimeSlot[] = [];
    const maxSlots = q.maxSlots ?? 6;

    // Iterate day by day in spa's timezone
    for (let day = new Date(q.rangeStart); day <= q.rangeEnd && slots.length < maxSlots; day.setDate(day.getDate() + 1)) {
      const localDay = toZonedTime(day, tz);
      const dow = localDay.getDay();

      // Is the spa open?
      const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dow];
      const spaHours = (spa.hoursJson as any)[dayKey];
      if (!spaHours) continue;

      for (const provider of providers) {
        if (slots.length >= maxSlots) break;

        // Provider's schedule that day
        const [sched] = await db.select().from(s.providerSchedules)
          .where(and(
            eq(s.providerSchedules.providerId, provider.id),
            eq(s.providerSchedules.dayOfWeek, dow),
          ));
        if (!sched) continue;

        // Working window = intersection of spa hours and provider hours
        const dayStr = format(localDay, 'yyyy-MM-dd');
        const winStart = fromZonedTime(`${dayStr}T${sched.startTime}:00`, tz);
        const winEnd = fromZonedTime(`${dayStr}T${sched.endTime}:00`, tz);

        // Get existing appointments for this provider today
        const dayBookings = await db.select().from(s.appointments)
          .where(and(
            eq(s.appointments.providerId, provider.id),
            eq(s.appointments.status, 'scheduled'),
            gte(s.appointments.startsAt, startOfDay(day)),
            lte(s.appointments.startsAt, endOfDay(day)),
          ));

        // Walk the day in granularity steps
        let cursor = new Date(winStart);
        const serviceDuration = service.durationMinutes;
        // Round cursor to next granularity
        const mins = cursor.getMinutes();
        const remainder = mins % SLOT_GRANULARITY_MIN;
        if (remainder !== 0) cursor = addMinutes(cursor, SLOT_GRANULARITY_MIN - remainder);

        while (addMinutes(cursor, serviceDuration) <= winEnd && slots.length < maxSlots) {
          const slotStart = new Date(cursor);
          const slotEnd = addMinutes(slotStart, serviceDuration);

          // Must be in the future
          if (slotStart <= new Date()) {
            cursor = addMinutes(cursor, SLOT_GRANULARITY_MIN);
            continue;
          }

          // Conflict check
          const conflict = dayBookings.some(b =>
            (slotStart < b.endsAt && slotEnd > b.startsAt)
          );
          if (!conflict) {
            slots.push({
              startsAt: slotStart,
              endsAt: slotEnd,
              providerId: provider.id,
              providerName: provider.name,
            });
          }
          cursor = addMinutes(cursor, SLOT_GRANULARITY_MIN);
        }
      }
    }

    return slots;
  }

  async createAppointment(input: { spaId: string; clientId: string; serviceId: string; providerId: string; startsAt: Date; callId?: string }) {
    const [service] = await db.select().from(s.services).where(eq(s.services.id, input.serviceId));
    if (!service) throw new Error('Service not found');

    const endsAt = addMinutes(input.startsAt, service.durationMinutes);

    // Re-check availability inside a transaction to prevent double-booking
    const [appt] = await db.transaction(async (tx) => {
      const conflicts = await tx.select().from(s.appointments)
        .where(and(
          eq(s.appointments.providerId, input.providerId),
          eq(s.appointments.status, 'scheduled'),
          sql`${s.appointments.startsAt} < ${endsAt}`,
          sql`${s.appointments.endsAt} > ${input.startsAt}`,
        ));
      if (conflicts.length > 0) throw new Error('SLOT_NO_LONGER_AVAILABLE');

      const estimatedValue = service.priceFrom ?? 0;
      return tx.insert(s.appointments).values({
        spaId: input.spaId,
        clientId: input.clientId,
        serviceId: input.serviceId,
        providerId: input.providerId,
        startsAt: input.startsAt,
        endsAt,
        estimatedValue,
        createdViaCallId: input.callId,
      }).returning();
    });

    // Fetch enriched info
    const [enriched] = await db.select({
      appt: s.appointments,
      svcName: s.services.name,
      providerName: s.providers.name,
      firstName: s.clients.firstName,
      lastName: s.clients.lastName,
    })
      .from(s.appointments)
      .innerJoin(s.services, eq(s.appointments.serviceId, s.services.id))
      .innerJoin(s.providers, eq(s.appointments.providerId, s.providers.id))
      .innerJoin(s.clients, eq(s.appointments.clientId, s.clients.id))
      .where(eq(s.appointments.id, appt.id));

    return {
      id: enriched.appt.id,
      startsAt: enriched.appt.startsAt,
      endsAt: enriched.appt.endsAt,
      serviceName: enriched.svcName,
      providerName: enriched.providerName,
      clientName: `${enriched.firstName ?? ''} ${enriched.lastName ?? ''}`.trim() || 'Guest',
    };
  }
}

export const pms = new DemoDbAdapter();
```

---

## 5. Backend Implementation

### 5.1 Server bootstrap

```typescript
// apps/api/src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import * as Sentry from '@sentry/node';
import { env } from './env';
import { registerToolRoutes } from './tools';
import { registerWebhookRoutes } from './webhooks/vapi';
import { registerDashboardRoutes } from './dashboard';

Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

const app = Fastify({
  logger: { level: env.LOG_LEVEL, transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined },
  trustProxy: true,
  bodyLimit: 5 * 1024 * 1024,  // 5MB for transcript payloads
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(cors, {
  origin: [env.DASHBOARD_URL, 'http://localhost:3000'],
  credentials: true,
});
await app.register(sensible);

app.get('/healthz', async () => ({ ok: true, ts: new Date().toISOString() }));

await app.register(registerToolRoutes, { prefix: '/v1/tools' });
await app.register(registerWebhookRoutes, { prefix: '/v1/webhooks' });
await app.register(registerDashboardRoutes, { prefix: '/v1/dashboard' });

app.setErrorHandler((err, _req, reply) => {
  Sentry.captureException(err);
  app.log.error(err);
  reply.status(err.statusCode ?? 500).send({ error: err.message });
});

await app.listen({ host: '0.0.0.0', port: env.PORT });
console.log(`🚀 API on :${env.PORT}`);
```

### 5.2 Env validation

```typescript
// apps/api/src/env.ts
import { z } from 'zod';
import 'dotenv/config';

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
  DASHBOARD_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),
});

export const env = Env.parse(process.env);
```

### 5.3 In-memory pub/sub for live dashboard

```typescript
// apps/api/src/lib/events.ts
import { EventEmitter } from 'node:events';

type LiveEvent =
  | { type: 'call.started'; callId: string; from: string }
  | { type: 'call.transcript'; callId: string; role: string; content: string }
  | { type: 'call.tool'; callId: string; tool: string; args: any; result: any }
  | { type: 'call.ended'; callId: string; outcome: string; durationSec: number }
  | { type: 'booking.created'; appointmentId: string; serviceName: string; startsAt: string };

class LiveBus extends EventEmitter {
  publish(event: LiveEvent) { this.emit('event', event); }
  subscribe(cb: (e: LiveEvent) => void) {
    this.on('event', cb);
    return () => this.off('event', cb);
  }
}
export const liveBus = new LiveBus();
liveBus.setMaxListeners(100);
```

This in-process pub/sub is enough for MVP. When you scale to multiple backend instances, swap it for Redis pub/sub — no changes to consumers.

---

## 6. Vapi Configuration

### 6.1 Assistant definition

Store the assistant config in your repo as `infra/vapi/assistant.json` so it's version-controlled. Push it to Vapi via their API on every deploy.

```json
{
  "name": "Aura Med Spa - Front Desk Agent",
  "model": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "temperature": 0.4,
    "maxTokens": 500,
    "systemPrompt": "<INJECTED FROM packages/prompts/agent-system.md>",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "lookup_client",
          "description": "Look up a client by their phone number to see if they're a returning client. Call this at the start of every call.",
          "parameters": {
            "type": "object",
            "properties": {},
            "required": []
          }
        },
        "server": { "url": "https://api.yourdomain.com/v1/tools/lookup_client" }
      },
      {
        "type": "function",
        "function": {
          "name": "list_services",
          "description": "List available services. Optionally filter by category: injectables, laser, facial, body, wellness.",
          "parameters": {
            "type": "object",
            "properties": {
              "category": { "type": "string", "enum": ["injectables", "laser", "facial", "body", "wellness"] }
            }
          }
        },
        "server": { "url": "https://api.yourdomain.com/v1/tools/list_services" }
      },
      {
        "type": "function",
        "function": {
          "name": "get_availability",
          "description": "Get available appointment slots for a service. Returns up to 6 slots in chronological order.",
          "parameters": {
            "type": "object",
            "properties": {
              "service_name": { "type": "string", "description": "Exact name of the service from list_services" },
              "provider_name": { "type": "string", "description": "Optional: specific provider's full name" },
              "preferred_day": { "type": "string", "description": "Optional: 'today', 'tomorrow', 'this week', 'next week', or a specific day name like 'Tuesday'" },
              "preferred_time_of_day": { "type": "string", "enum": ["morning", "afternoon", "evening", "any"] }
            },
            "required": ["service_name"]
          }
        },
        "server": { "url": "https://api.yourdomain.com/v1/tools/get_availability" }
      },
      {
        "type": "function",
        "function": {
          "name": "create_appointment",
          "description": "Book an appointment. ALWAYS confirm date/time/service/provider with the caller before calling this.",
          "parameters": {
            "type": "object",
            "properties": {
              "service_name": { "type": "string" },
              "provider_name": { "type": "string" },
              "starts_at_iso": { "type": "string", "description": "ISO 8601 UTC timestamp from a slot returned by get_availability" },
              "first_name": { "type": "string" },
              "last_name": { "type": "string" },
              "email": { "type": "string", "description": "Optional" }
            },
            "required": ["service_name", "provider_name", "starts_at_iso", "first_name"]
          }
        },
        "server": { "url": "https://api.yourdomain.com/v1/tools/create_appointment" }
      },
      {
        "type": "function",
        "function": {
          "name": "transfer_to_human",
          "description": "Transfer the call to a human team member. Use for: existing appointment changes, medical questions, complaints, languages other than English, anything off-script.",
          "parameters": {
            "type": "object",
            "properties": {
              "reason": { "type": "string", "description": "Brief reason for the transfer" }
            },
            "required": ["reason"]
          }
        },
        "server": { "url": "https://api.yourdomain.com/v1/tools/transfer_to_human" }
      }
    ]
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "model": "eleven_turbo_v2_5",
    "stability": 0.55,
    "similarityBoost": 0.75
  },
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-3",
    "language": "en-US",
    "smartFormat": true
  },
  "firstMessage": "Hi, thanks for calling Aura Med Spa, this is Maya — how can I help you today?",
  "endCallMessage": "Thanks so much for calling Aura Med Spa, have a great day!",
  "voicemailDetection": {
    "provider": "twilio",
    "enabled": true,
    "machineDetectionTimeout": 8
  },
  "responseDelaySeconds": 0.4,
  "llmRequestDelaySeconds": 0.1,
  "numWordsToInterruptAssistant": 2,
  "maxDurationSeconds": 900,
  "backgroundSound": "office",
  "backchannelingEnabled": true,
  "backgroundDenoisingEnabled": true,
  "modelOutputInMessagesEnabled": true,
  "serverUrl": "https://api.yourdomain.com/v1/webhooks/vapi",
  "serverUrlSecret": "<VAPI_WEBHOOK_SECRET>",
  "endCallFunctionEnabled": false,
  "recordingEnabled": true,
  "hipaaEnabled": false
}
```

### 6.2 Deploy script

```typescript
// infra/vapi/deploy.ts
import fs from 'node:fs';
import path from 'node:path';

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'assistant.json'), 'utf-8'));
  const systemPrompt = fs.readFileSync(
    path.join(__dirname, '../../packages/prompts/agent-system.md'),
    'utf-8'
  );
  config.model.systemPrompt = systemPrompt;
  config.serverUrlSecret = process.env.VAPI_WEBHOOK_SECRET;
  for (const t of config.model.tools) {
    t.server.url = t.server.url.replace('https://api.yourdomain.com', process.env.API_BASE_URL!);
  }

  const url = ASSISTANT_ID
    ? `https://api.vapi.ai/assistant/${ASSISTANT_ID}`
    : 'https://api.vapi.ai/assistant';
  const method = ASSISTANT_ID ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VAPI_API_KEY}` },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    console.error('❌ Failed:', await res.text());
    process.exit(1);
  }
  const data = await res.json();
  console.log(`✅ Assistant ${ASSISTANT_ID ? 'updated' : 'created'}:`, data.id);
}

main().catch(console.error);
```

---

## 7. The System Prompt

This is your IP. Lives in `packages/prompts/agent-system.md`, version-controlled, edited like code.

```markdown
# IDENTITY
You are Maya, the virtual receptionist for Aura Med Spa in New York City. You speak naturally and warmly, like a polished concierge. You are NOT a medical professional and never give medical advice.

# CONTEXT
- Spa name: Aura Med Spa
- Location: 142 Greene Street, New York, NY 10012
- Hours: Mon-Wed 9am-7pm, Thu-Fri 9am-8pm, Sat 10am-6pm, Sun closed
- All times are New York time (Eastern)
- This call is being recorded for quality.

# YOUR GOAL
Help callers book appointments. That's the primary outcome. Be helpful with information when needed, but always move toward booking.

# CRITICAL RULES
1. NEVER give medical advice. If asked "is X safe for me?" or "will X work for my condition?" → say: "Great question for one of our nurses. Want me to book you a free consultation, or have someone call you back?"
2. NEVER quote a precise price as the final price. Use ranges from list_services. Say things like "Botox typically runs $14-18 per unit; your injector confirms the unit count at your appointment."
3. NEVER attempt to reschedule, cancel, or modify an existing appointment → call `transfer_to_human`.
4. NEVER discuss pregnancy, breastfeeding, medications, or medical conditions in a way that gives advice → deflect to consultation.
5. If the caller speaks a language other than English, say "One moment, I'll connect you with someone who can help" → call `transfer_to_human` with reason "non-English caller".
6. If the caller is angry, frustrated, or making a complaint → call `transfer_to_human` with reason "complaint".
7. Keep responses SHORT and conversational. 1-2 sentences per turn. This is a phone call, not an email.

# CONVERSATION FLOW

## At call start
- Call `lookup_client` immediately. If they're a returning client, greet them by first name.
- If new, just go with your default greeting and collect their name when booking.

## Booking flow
1. Identify what service they want. If vague ("I want my lips done"), ask which they had in mind: lip filler, lip flip with Botox, or a free consult.
2. Call `list_services` if you need pricing or duration details to answer questions.
3. Ask preferences: any specific provider? Any preferred time of day? This week or next?
4. Call `get_availability` with their preferences.
5. Offer 2 specific slots (not a long list). Example: "I have Tuesday at 2pm with Jessica or Thursday at 11am with Jessica — which works better?"
6. If neither works, ask what would work and call `get_availability` again.
7. Once they choose, confirm: "Perfect, that's [service] with [provider] on [day, date] at [time]. Can I get your name?"
8. Collect first name and last name. Email is optional — don't push for it.
9. Call `create_appointment`.
10. Confirm verbally and mention SMS: "You're all set, [name]. I just sent a confirmation text to this number. Anything else I can help with?"

## Pricing questions
- Use the priceFrom/priceTo from list_services
- Always include the unit ("per unit", "per syringe", "flat")
- Example: "Botox runs $14 to $18 per unit, with most clients needing 20-30 units depending on the areas being treated."

## Returning client recognition
- If lookup_client returns a client with a preferredProviderName, offer them first: "Looking to book with Jessica again?"
- If they're VIP-flagged or have notes, just use that to inform tone, don't read notes aloud.

## Off-topic / unsupported
- Reschedule/cancel → transfer
- Medical advice → deflect to consultation
- Complaint or frustration → transfer
- "Can I speak to someone?" → transfer
- Languages other than English → transfer

# ENDING THE CALL
- Always end warmly: "Thanks for calling Aura, [name] — see you [day]!"
- If you're transferring, say: "One moment, I'll connect you" before calling transfer_to_human.

# TONE EXAMPLES
GOOD: "Sure! Lip filler with Jessica is great — I have Thursday at 11 or Saturday at 2. Which works better?"
BAD: "I would be delighted to assist you in scheduling an appointment for lip filler services."

GOOD: "Botox runs about $14-18 per unit. Most lip flips use 4-6 units, so you're looking at roughly $60-110."
BAD: "Botox is $14 per unit."

GOOD: "That's a great question for our nurse — want a free 30-min consult?"
BAD: "Botox is safe during breastfeeding but you should ask your doctor."
```

---

## 8. Tool Endpoints (Deep Dive)

All five tool endpoints share a pattern: authenticate the Vapi caller via shared secret, parse args, look up the call context, call the adapter, log to DB, publish a live event, return a string-friendly result for the LLM.

### 8.1 Shared middleware

```typescript
// apps/api/src/tools/index.ts
import { FastifyInstance } from 'fastify';
import { env } from '../env';
import { lookupClientRoute } from './lookup-client';
import { listServicesRoute } from './list-services';
import { getAvailabilityRoute } from './get-availability';
import { createAppointmentRoute } from './create-appointment';
import { transferToHumanRoute } from './transfer-to-human';

export async function registerToolRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const auth = req.headers['x-vapi-secret'];
    if (auth !== env.TOOL_AUTH_SECRET) return reply.code(401).send({ error: 'Unauthorized' });
  });

  await lookupClientRoute(app);
  await listServicesRoute(app);
  await getAvailabilityRoute(app);
  await createAppointmentRoute(app);
  await transferToHumanRoute(app);
}
```

### 8.2 Vapi tool payload shape

Vapi POSTs to your tool URL with a shape roughly like:

```json
{
  "message": {
    "type": "tool-calls",
    "call": { "id": "vapi-xyz", "customer": { "number": "+15555551234" } },
    "toolCalls": [
      { "id": "toolcall_abc", "function": { "name": "lookup_client", "arguments": "{}" } }
    ]
  }
}
```

You return:

```json
{
  "results": [
    { "toolCallId": "toolcall_abc", "result": "<string the LLM reads>" }
  ]
}
```

### 8.3 `lookup_client`

```typescript
// apps/api/src/tools/lookup-client.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { pms } from '../adapters/demo-db';
import { logToolCall } from '../lib/logging';

const ReqSchema = z.object({
  message: z.object({
    call: z.object({
      id: z.string(),
      customer: z.object({ number: z.string() }).optional(),
    }),
    toolCalls: z.array(z.object({
      id: z.string(),
      function: z.object({ name: z.string(), arguments: z.string() }),
    })),
  }),
});

export async function lookupClientRoute(app: FastifyInstance) {
  app.post('/lookup_client', async (req, reply) => {
    const start = Date.now();
    const parsed = ReqSchema.parse(req.body);
    const tc = parsed.message.toolCalls[0];
    const phone = parsed.message.call.customer?.number;

    if (!phone) {
      return reply.send({
        results: [{ toolCallId: tc.id, result: 'No caller ID available. Treat as new client.' }],
      });
    }

    const client = await pms.lookupClient(env.DEMO_SPA_ID, phone);
    const durationMs = Date.now() - start;

    let result: string;
    if (!client) {
      result = `New client. Caller phone: ${phone}. Treat as first-time visitor.`;
    } else {
      const name = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
      const parts = [`Returning client: ${name}`];
      if (client.preferredProviderName) parts.push(`Prefers ${client.preferredProviderName}`);
      if (client.vipFlag) parts.push('VIP client — treat warmly');
      if (client.notes) parts.push(`Notes for staff (do not read aloud): ${client.notes}`);
      result = parts.join('. ');
    }

    await logToolCall({
      vapiCallId: parsed.message.call.id,
      toolName: 'lookup_client',
      args: { phone },
      result: { found: !!client, clientId: client?.id },
      durationMs,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
```

### 8.4 `list_services`

```typescript
// apps/api/src/tools/list-services.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { pms } from '../adapters/demo-db';
import { logToolCall } from '../lib/logging';

const ArgsSchema = z.object({ category: z.string().optional() });

export async function listServicesRoute(app: FastifyInstance) {
  app.post('/list_services', async (req: any) => {
    const start = Date.now();
    const tc = req.body.message.toolCalls[0];
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));

    const services = await pms.listServices(env.DEMO_SPA_ID, { category: args.category });

    const lines = services.map(s => {
      let line = `${s.name} (${s.durationMinutes} min)`;
      if (s.priceFrom !== null) {
        if (s.priceFrom === 0) line += ' - FREE';
        else if (s.priceFrom === s.priceTo) line += ` - $${s.priceFrom} ${s.priceUnit ?? ''}`;
        else line += ` - $${s.priceFrom}-$${s.priceTo} ${s.priceUnit ?? ''}`;
      }
      if (s.requiresConsult) line += ' [requires consult for new clients]';
      return line;
    });

    const result = lines.length
      ? `Services${args.category ? ` (${args.category})` : ''}:\n${lines.join('\n')}`
      : 'No matching services found.';

    await logToolCall({
      vapiCallId: req.body.message.call.id,
      toolName: 'list_services',
      args,
      result: { count: services.length },
      durationMs: Date.now() - start,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
```

### 8.5 `get_availability`

The trickiest endpoint. It does natural-language date parsing because the LLM passes "tomorrow afternoon" not ISO dates.

```typescript
// apps/api/src/tools/get-availability.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDays, startOfDay, setHours, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { env } from '../env';
import { pms } from '../adapters/demo-db';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { logToolCall } from '../lib/logging';

const ArgsSchema = z.object({
  service_name: z.string(),
  provider_name: z.string().optional(),
  preferred_day: z.string().optional(),
  preferred_time_of_day: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
});

function parsePreferredDay(input: string | undefined, tz: string): { start: Date; end: Date } {
  const nowLocal = toZonedTime(new Date(), tz);
  const todayStart = startOfDay(nowLocal);
  if (!input || input.toLowerCase() === 'any') {
    return { start: todayStart, end: addDays(todayStart, 14) };
  }
  const lower = input.toLowerCase();
  if (lower.includes('today')) return { start: todayStart, end: addDays(todayStart, 1) };
  if (lower.includes('tomorrow')) return { start: addDays(todayStart, 1), end: addDays(todayStart, 2) };
  if (lower.includes('this week')) return { start: todayStart, end: addDays(todayStart, 7) };
  if (lower.includes('next week')) return { start: addDays(todayStart, 7), end: addDays(todayStart, 14) };
  // Day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const dow = nowLocal.getDay();
      let delta = (i - dow + 7) % 7;
      if (delta === 0) delta = 7;
      const target = addDays(todayStart, delta);
      return { start: target, end: addDays(target, 1) };
    }
  }
  return { start: todayStart, end: addDays(todayStart, 14) };
}

function filterByTimeOfDay(slots: any[], tod: string | undefined, tz: string) {
  if (!tod || tod === 'any') return slots;
  return slots.filter(slot => {
    const local = toZonedTime(slot.startsAt, tz);
    const h = local.getHours();
    if (tod === 'morning') return h >= 6 && h < 12;
    if (tod === 'afternoon') return h >= 12 && h < 17;
    if (tod === 'evening') return h >= 17 && h < 22;
    return true;
  });
}

export async function getAvailabilityRoute(app: FastifyInstance) {
  app.post('/get_availability', async (req: any) => {
    const start = Date.now();
    const tc = req.body.message.toolCalls[0];
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));

    const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, env.DEMO_SPA_ID));
    const tz = spa.timezone;

    // Fuzzy match service name (LLMs sometimes paraphrase)
    const [service] = await db.select().from(s.services)
      .where(and(eq(s.services.spaId, env.DEMO_SPA_ID), ilike(s.services.name, `%${args.service_name}%`)))
      .limit(1);

    if (!service) {
      return {
        results: [{
          toolCallId: tc.id,
          result: `Couldn't find a service matching "${args.service_name}". Please call list_services and pick an exact name.`,
        }],
      };
    }

    // Optional provider filter
    let providerId: string | undefined;
    if (args.provider_name) {
      const [p] = await db.select().from(s.providers)
        .where(and(eq(s.providers.spaId, env.DEMO_SPA_ID), ilike(s.providers.name, `%${args.provider_name}%`)))
        .limit(1);
      if (p) providerId = p.id;
    }

    const range = parsePreferredDay(args.preferred_day, tz);
    let slots = await pms.getAvailability({
      spaId: env.DEMO_SPA_ID,
      serviceId: service.id,
      providerId,
      rangeStart: range.start,
      rangeEnd: range.end,
      maxSlots: 12,
    });
    slots = filterByTimeOfDay(slots, args.preferred_time_of_day, tz);
    slots = slots.slice(0, 6);

    let result: string;
    if (slots.length === 0) {
      result = `No availability found for ${service.name}${args.preferred_day ? ` ${args.preferred_day}` : ''}. Suggest a different day or provider.`;
    } else {
      const formatted = slots.map(slot => {
        const local = toZonedTime(slot.startsAt, tz);
        const dayLabel = format(local, 'EEEE, MMM d');
        const timeLabel = format(local, 'h:mm a');
        return `- ${dayLabel} at ${timeLabel} with ${slot.providerName} (slot ID: ${slot.startsAt.toISOString()})`;
      }).join('\n');
      result = `Available slots for ${service.name}:\n${formatted}\n\nWhen offering to caller, mention only 2 slots. Use the ISO timestamp as starts_at_iso when calling create_appointment.`;
    }

    await logToolCall({
      vapiCallId: req.body.message.call.id,
      toolName: 'get_availability',
      args,
      result: { count: slots.length },
      durationMs: Date.now() - start,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
```

### 8.6 `create_appointment`

```typescript
// apps/api/src/tools/create-appointment.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { db } from '../db';
import { env } from '../env';
import * as s from '@medspa/db/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { pms } from '../adapters/demo-db';
import { sendSms } from '../lib/sms';
import { liveBus } from '../lib/events';
import { logToolCall } from '../lib/logging';

const ArgsSchema = z.object({
  service_name: z.string(),
  provider_name: z.string(),
  starts_at_iso: z.string(),
  first_name: z.string(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
});

export async function createAppointmentRoute(app: FastifyInstance) {
  app.post('/create_appointment', async (req: any) => {
    const start = Date.now();
    const tc = req.body.message.toolCalls[0];
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));
    const phone = req.body.message.call.customer?.number;
    const vapiCallId = req.body.message.call.id;

    if (!phone) {
      return {
        results: [{ toolCallId: tc.id, result: 'Cannot book without caller phone number. Transfer to human.' }],
      };
    }

    try {
      // Resolve service
      const [service] = await db.select().from(s.services)
        .where(and(eq(s.services.spaId, env.DEMO_SPA_ID), ilike(s.services.name, `%${args.service_name}%`)))
        .limit(1);
      if (!service) throw new Error('Service not found');

      // Resolve provider
      const [provider] = await db.select().from(s.providers)
        .where(and(eq(s.providers.spaId, env.DEMO_SPA_ID), ilike(s.providers.name, `%${args.provider_name}%`)))
        .limit(1);
      if (!provider) throw new Error('Provider not found');

      // Upsert client
      const client = await pms.upsertClient(env.DEMO_SPA_ID, {
        phone,
        firstName: args.first_name,
        lastName: args.last_name,
        email: args.email,
      });

      // Find the call row by Vapi call ID
      const [callRow] = await db.select().from(s.calls).where(eq(s.calls.vapiCallId, vapiCallId)).limit(1);

      // Create the appointment
      const appt = await pms.createAppointment({
        spaId: env.DEMO_SPA_ID,
        clientId: client.id,
        serviceId: service.id,
        providerId: provider.id,
        startsAt: new Date(args.starts_at_iso),
        callId: callRow?.id,
      });

      // Link call to appointment
      if (callRow) {
        await db.update(s.calls)
          .set({ outcome: 'booked', appointmentId: appt.id })
          .where(eq(s.calls.id, callRow.id));
      }

      // SMS confirmation (fire-and-forget)
      const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, env.DEMO_SPA_ID));
      const localStart = toZonedTime(appt.startsAt, spa.timezone);
      const friendlyDate = format(localStart, 'EEEE, MMM d');
      const friendlyTime = format(localStart, 'h:mm a');
      sendSms(phone, `Hi ${args.first_name}! You're confirmed at ${spa.name} for ${service.name} with ${provider.name} on ${friendlyDate} at ${friendlyTime}. Address: ${spa.address}. Reply STOP to opt out.`).catch(console.error);

      // Live event
      liveBus.publish({
        type: 'booking.created',
        appointmentId: appt.id,
        serviceName: appt.serviceName,
        startsAt: appt.startsAt.toISOString(),
      });

      const result = `BOOKED: ${appt.serviceName} with ${appt.providerName} on ${friendlyDate} at ${friendlyTime}. SMS confirmation sent to ${phone}. Tell the caller it's confirmed and a text is on the way.`;

      await logToolCall({ vapiCallId, toolName: 'create_appointment', args, result: { appointmentId: appt.id }, durationMs: Date.now() - start });
      return { results: [{ toolCallId: tc.id, result }] };
    } catch (err: any) {
      let userMsg: string;
      if (err.message === 'SLOT_NO_LONGER_AVAILABLE') {
        userMsg = 'That slot was just booked. Call get_availability again and offer a different time.';
      } else if (err.message.includes('not found')) {
        userMsg = `Could not find ${err.message}. Call list_services and verify the exact name.`;
      } else {
        userMsg = 'Booking failed due to a system error. Apologize and offer to take a name + callback number.';
      }
      await logToolCall({ vapiCallId, toolName: 'create_appointment', args, result: { error: err.message }, durationMs: Date.now() - start, success: false });
      return { results: [{ toolCallId: tc.id, result: userMsg }] };
    }
  });
}
```

### 8.7 `transfer_to_human`

```typescript
// apps/api/src/tools/transfer-to-human.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db';
import { env } from '../env';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';
import { logToolCall } from '../lib/logging';

const ArgsSchema = z.object({ reason: z.string() });

export async function transferToHumanRoute(app: FastifyInstance) {
  app.post('/transfer_to_human', async (req: any) => {
    const tc = req.body.message.toolCalls[0];
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));

    const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, env.DEMO_SPA_ID));
    const transferNumber = spa.transferNumber;

    if (!transferNumber) {
      return {
        results: [{ toolCallId: tc.id, result: 'No transfer number configured. Apologize and offer a callback.' }],
      };
    }

    await db.update(s.calls)
      .set({ outcome: 'transferred', summary: `Transferred: ${args.reason}` })
      .where(eq(s.calls.vapiCallId, req.body.message.call.id));

    await logToolCall({
      vapiCallId: req.body.message.call.id,
      toolName: 'transfer_to_human',
      args,
      result: { transferNumber },
      durationMs: 0,
    });

    // Vapi's transfer destination response shape
    return {
      results: [{
        toolCallId: tc.id,
        result: { destination: { type: 'number', number: transferNumber } },
      }],
    };
  });
}
```

### 8.8 Logging helper

```typescript
// apps/api/src/lib/logging.ts
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';

export async function logToolCall(input: {
  vapiCallId: string;
  toolName: string;
  args: any;
  result: any;
  durationMs: number;
  success?: boolean;
}) {
  const [callRow] = await db.select().from(s.calls).where(eq(s.calls.vapiCallId, input.vapiCallId)).limit(1);
  if (!callRow) return;
  await db.insert(s.toolCalls).values({
    callId: callRow.id,
    toolName: input.toolName,
    argsJson: input.args,
    resultJson: input.result,
    durationMs: input.durationMs,
    success: input.success !== false,
  });
}
```

---

## 9. Webhook Handlers

Vapi fires events at multiple points: `status-update`, `transcript`, `function-call`, `end-of-call-report`. You receive all of these at one endpoint.

```typescript
// apps/api/src/webhooks/vapi.ts
import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { env } from '../env';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';
import { liveBus } from '../lib/events';
import { downloadRecording } from '../lib/recordings';

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/vapi', async (req: any, reply) => {
    const auth = req.headers['x-vapi-secret'];
    if (auth !== env.VAPI_WEBHOOK_SECRET) return reply.code(401).send();

    const msg = req.body.message;
    if (!msg) return reply.send({ ok: true });

    try {
      switch (msg.type) {
        case 'status-update': {
          if (msg.status === 'in-progress') {
            await db.insert(s.calls).values({
              spaId: env.DEMO_SPA_ID,
              vapiCallId: msg.call.id,
              direction: 'inbound',
              fromNumber: msg.call.customer?.number ?? 'unknown',
              toNumber: msg.call.phoneNumber?.number ?? 'unknown',
              startedAt: new Date(msg.call.startedAt ?? Date.now()),
              outcome: 'in_progress',
            }).onConflictDoNothing();
            liveBus.publish({
              type: 'call.started',
              callId: msg.call.id,
              from: msg.call.customer?.number ?? 'unknown',
            });
          }
          break;
        }

        case 'transcript': {
          if (msg.transcriptType !== 'final') break;
          const [callRow] = await db.select().from(s.calls).where(eq(s.calls.vapiCallId, msg.call.id)).limit(1);
          if (!callRow) break;
          await db.insert(s.callTranscripts).values({
            callId: callRow.id,
            role: msg.role,
            content: msg.transcript,
          });
          liveBus.publish({
            type: 'call.transcript',
            callId: msg.call.id,
            role: msg.role,
            content: msg.transcript,
          });
          break;
        }

        case 'end-of-call-report': {
          const [callRow] = await db.select().from(s.calls).where(eq(s.calls.vapiCallId, msg.call.id)).limit(1);
          if (!callRow) break;

          await db.update(s.calls).set({
            endedAt: new Date(msg.endedAt ?? Date.now()),
            durationSeconds: msg.durationSeconds ?? 0,
            costUsd: msg.cost ?? 0,
            summary: msg.summary ?? null,
            outcome: callRow.outcome === 'in_progress'
              ? (msg.endedReason?.includes('customer') ? 'info_only' : 'failed')
              : callRow.outcome,
          }).where(eq(s.calls.id, callRow.id));

          // Download recording asynchronously
          if (msg.recordingUrl) {
            downloadRecording(msg.recordingUrl, callRow.id).catch(console.error);
          }

          liveBus.publish({
            type: 'call.ended',
            callId: msg.call.id,
            outcome: callRow.outcome,
            durationSec: msg.durationSeconds ?? 0,
          });
          break;
        }
      }

      return reply.send({ ok: true });
    } catch (err) {
      app.log.error({ err, msg }, 'Webhook handler error');
      return reply.code(500).send({ error: 'webhook handler failed' });
    }
  });
}
```

### 9.1 Recording download

```typescript
// apps/api/src/lib/recordings.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

export async function downloadRecording(vapiRecordingUrl: string, callId: string) {
  const res = await fetch(vapiRecordingUrl);
  if (!res.ok) throw new Error(`Failed to fetch recording: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = `recordings/${callId}.mp3`;

  await r2.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET, Key: key, Body: buffer, ContentType: 'audio/mpeg',
  }));

  const url = `https://${env.R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
  await db.update(s.calls).set({ recordingUrl: url }).where(eq(s.calls.id, callId));
}
```

### 9.2 SMS helper

```typescript
// apps/api/src/lib/sms.ts
import twilio from 'twilio';
import { env } from '../env';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendSms(to: string, body: string) {
  return client.messages.create({ from: env.TWILIO_FROM_NUMBER, to, body });
}
```

---

## 10. The Dashboard

Full agency-grade Next.js 15 dashboard. Six routes, all built with Tailwind + shadcn/ui aesthetic.

### 10.1 Routes

| Route | Purpose | Demo importance |
|---|---|---|
| `/` (Home) | ROI dashboard: bookings, revenue captured, calls answered | ⭐⭐⭐ critical |
| `/live` | Real-time call view with streaming transcript | ⭐⭐⭐ the WOW moment |
| `/calls` | Call log with transcripts, recordings, outcomes | ⭐⭐⭐ |
| `/bookings` | Bookings table | ⭐⭐ |
| `/settings` | Spa info, hours, voice config | ⭐ |

### 10.2 Dashboard API endpoints

```typescript
// apps/api/src/dashboard/index.ts
import { FastifyInstance } from 'fastify';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq, desc, sql, gte, and } from 'drizzle-orm';
import { startOfDay, subDays } from 'date-fns';
import { env } from '../env';
import { liveBus } from '../lib/events';

export async function registerDashboardRoutes(app: FastifyInstance) {
  // GET /v1/dashboard/stats
  app.get('/stats', async () => {
    const since30 = subDays(new Date(), 30);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.calls)
      .where(and(eq(s.calls.spaId, env.DEMO_SPA_ID), gte(s.calls.startedAt, since30)));
    const [{ booked }] = await db.select({ booked: sql<number>`count(*)::int` }).from(s.calls)
      .where(and(eq(s.calls.spaId, env.DEMO_SPA_ID), eq(s.calls.outcome, 'booked'), gte(s.calls.startedAt, since30)));
    const [{ revenue }] = await db.select({ revenue: sql<number>`coalesce(sum(estimated_value), 0)::float` })
      .from(s.appointments)
      .where(and(eq(s.appointments.spaId, env.DEMO_SPA_ID), gte(s.appointments.createdAt, since30)));
    const [{ avgDur }] = await db.select({ avgDur: sql<number>`coalesce(avg(duration_seconds), 0)::float` })
      .from(s.calls).where(and(eq(s.calls.spaId, env.DEMO_SPA_ID), gte(s.calls.startedAt, since30)));

    return {
      callsAnswered: total,
      bookingsMade: booked,
      revenueCaptured: revenue,
      avgCallSeconds: Math.round(avgDur),
      conversionRate: total > 0 ? Math.round((booked / total) * 100) : 0,
    };
  });

  // GET /v1/dashboard/calls?limit=20
  app.get<{ Querystring: { limit?: string } }>('/calls', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '50'), 200);
    const rows = await db.select().from(s.calls)
      .where(eq(s.calls.spaId, env.DEMO_SPA_ID))
      .orderBy(desc(s.calls.startedAt))
      .limit(limit);
    return rows;
  });

  // GET /v1/dashboard/calls/:id
  app.get<{ Params: { id: string } }>('/calls/:id', async (req) => {
    const [call] = await db.select().from(s.calls).where(eq(s.calls.id, req.params.id));
    if (!call) throw app.httpErrors.notFound();
    const transcript = await db.select().from(s.callTranscripts)
      .where(eq(s.callTranscripts.callId, call.id))
      .orderBy(s.callTranscripts.timestamp);
    const tools = await db.select().from(s.toolCalls)
      .where(eq(s.toolCalls.callId, call.id))
      .orderBy(s.toolCalls.timestamp);
    return { call, transcript, tools };
  });

  // GET /v1/dashboard/bookings
  app.get('/bookings', async () => {
    return db.select({
      appointment: s.appointments,
      serviceName: s.services.name,
      providerName: s.providers.name,
      clientFirstName: s.clients.firstName,
      clientLastName: s.clients.lastName,
      clientPhone: s.clients.phone,
    })
      .from(s.appointments)
      .innerJoin(s.services, eq(s.appointments.serviceId, s.services.id))
      .innerJoin(s.providers, eq(s.appointments.providerId, s.providers.id))
      .innerJoin(s.clients, eq(s.appointments.clientId, s.clients.id))
      .where(eq(s.appointments.spaId, env.DEMO_SPA_ID))
      .orderBy(desc(s.appointments.createdAt))
      .limit(100);
  });

  // GET /v1/dashboard/live (Server-Sent Events)
  app.get('/live', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: any) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'connected', ts: new Date().toISOString() });

    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15_000);
    const unsubscribe = liveBus.subscribe(send);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
```

### 10.3 Dashboard frontend essentials

```typescript
// apps/dashboard/lib/api.ts
const API = process.env.NEXT_PUBLIC_API_URL!;

export async function fetchStats() {
  const r = await fetch(`${API}/v1/dashboard/stats`, { credentials: 'include' });
  return r.json();
}

export async function fetchCalls(limit = 50) {
  const r = await fetch(`${API}/v1/dashboard/calls?limit=${limit}`, { credentials: 'include' });
  return r.json();
}

export async function fetchCall(id: string) {
  const r = await fetch(`${API}/v1/dashboard/calls/${id}`, { credentials: 'include' });
  return r.json();
}

export async function fetchBookings() {
  const r = await fetch(`${API}/v1/dashboard/bookings`, { credentials: 'include' });
  return r.json();
}

// SSE hook for live view
import { useEffect, useState } from 'react';

export function useLiveStream() {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    const es = new EventSource(`${API}/v1/dashboard/live`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, data].slice(-200));
    };
    return () => es.close();
  }, []);
  return events;
}
```

### 10.4 Home / ROI dashboard

```tsx
// apps/dashboard/app/(dashboard)/page.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '@/lib/api';
import { Phone, Calendar, DollarSign, TrendingUp } from 'lucide-react';

export default function Home() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 30_000 });
  if (!stats) return <div className="p-8">Loading…</div>;

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Aura Med Spa</h1>
        <p className="text-gray-500">Last 30 days</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Phone />} label="Calls answered" value={stats.callsAnswered} />
        <StatCard icon={<Calendar />} label="Bookings made" value={stats.bookingsMade} />
        <StatCard icon={<DollarSign />} label="Revenue captured" value={`$${stats.revenueCaptured.toLocaleString()}`} accent />
        <StatCard icon={<TrendingUp />} label="Conversion" value={`${stats.conversionRate}%`} />
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-medium mb-2">ROI summary</h2>
        <p className="text-gray-700">
          Your AI receptionist booked <strong>{stats.bookingsMade}</strong> appointments worth
          <strong> ${stats.revenueCaptured.toLocaleString()}</strong> in estimated revenue over the last 30 days.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: any) {
  return (
    <div className={`rounded-xl border p-6 ${accent ? 'bg-emerald-50 border-emerald-200' : 'bg-white'}`}>
      <div className="flex items-center gap-2 text-gray-500 mb-2">{icon}<span className="text-sm">{label}</span></div>
      <div className="text-3xl font-semibold">{value}</div>
    </div>
  );
}
```

### 10.5 Live call view (the wow demo)

```tsx
// apps/dashboard/app/(dashboard)/live/page.tsx
'use client';
import { useLiveStream } from '@/lib/api';
import { useMemo } from 'react';

export default function LivePage() {
  const events = useLiveStream();

  const activeCalls = useMemo(() => {
    const map = new Map<string, any>();
    for (const ev of events) {
      if (ev.type === 'call.started') {
        map.set(ev.callId, { id: ev.callId, from: ev.from, turns: [], startedAt: new Date() });
      } else if (ev.type === 'call.transcript') {
        const c = map.get(ev.callId);
        if (c) c.turns.push({ role: ev.role, content: ev.content, at: new Date() });
      } else if (ev.type === 'call.ended') {
        const c = map.get(ev.callId);
        if (c) { c.ended = true; c.outcome = ev.outcome; }
      }
    }
    return Array.from(map.values()).reverse();
  }, [events]);

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-3xl font-semibold mb-2">Live calls</h1>
      <p className="text-gray-500 mb-6">Real-time view as conversations happen.</p>

      {activeCalls.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center text-gray-400">
          No active calls. Pick up your phone and dial the spa number to see it light up here.
        </div>
      )}

      <div className="space-y-6">
        {activeCalls.map(call => (
          <div key={call.id} className="rounded-xl border bg-white p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="text-sm text-gray-500">Caller</div>
                <div className="font-medium">{call.from}</div>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm ${call.ended ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-700'}`}>
                {call.ended ? `Ended (${call.outcome})` : '● Live'}
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {call.turns.map((t: any, i: number) => (
                <div key={i} className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-md px-4 py-2 rounded-2xl ${
                    t.role === 'assistant' ? 'bg-gray-100' : 'bg-blue-100 text-blue-900'
                  }`}>
                    <div className="text-xs text-gray-500 mb-1">{t.role === 'assistant' ? 'Maya' : 'Caller'}</div>
                    {t.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 10.6 Calls log + detail

```tsx
// apps/dashboard/app/(dashboard)/calls/page.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchCalls } from '@/lib/api';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

const outcomeBadges: any = {
  booked: 'bg-emerald-100 text-emerald-700',
  transferred: 'bg-amber-100 text-amber-700',
  info_only: 'bg-gray-100 text-gray-700',
  voicemail: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  in_progress: 'bg-purple-100 text-purple-700',
};

export default function CallsPage() {
  const { data: calls } = useQuery({ queryKey: ['calls'], queryFn: () => fetchCalls(100), refetchInterval: 10_000 });
  if (!calls) return <div className="p-8">Loading…</div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold mb-6">Calls</h1>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 text-sm">From</th>
              <th className="text-left p-3 text-sm">When</th>
              <th className="text-left p-3 text-sm">Duration</th>
              <th className="text-left p-3 text-sm">Outcome</th>
              <th className="text-left p-3 text-sm">Summary</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c: any) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono text-sm">{c.fromNumber}</td>
                <td className="p-3 text-sm">{formatDistanceToNow(new Date(c.startedAt), { addSuffix: true })}</td>
                <td className="p-3 text-sm">{c.durationSeconds ? `${c.durationSeconds}s` : '—'}</td>
                <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${outcomeBadges[c.outcome]}`}>{c.outcome.replace('_',' ')}</span></td>
                <td className="p-3 text-sm text-gray-600">
                  <Link href={`/calls/${c.id}`} className="text-blue-600 hover:underline">{c.summary?.slice(0, 60) ?? 'View'}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

```tsx
// apps/dashboard/app/(dashboard)/calls/[id]/page.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchCall } from '@/lib/api';
import { useParams } from 'next/navigation';

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery({ queryKey: ['call', id], queryFn: () => fetchCall(id) });
  if (!data) return <div className="p-8">Loading…</div>;
  const { call, transcript, tools } = data;

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Call detail</h1>
        <p className="text-gray-500">{call.fromNumber} • {new Date(call.startedAt).toLocaleString()}</p>
      </div>

      {call.recordingUrl && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-medium mb-2">Recording</h2>
          <audio controls src={call.recordingUrl} className="w-full" />
        </div>
      )}

      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-medium mb-4">Transcript</h2>
        <div className="space-y-3">
          {transcript.map((t: any) => (
            <div key={t.id} className="flex gap-3">
              <div className="text-xs text-gray-500 w-20 shrink-0 pt-1">{t.role === 'assistant' ? 'Maya' : 'Caller'}</div>
              <div className="flex-1">{t.content}</div>
            </div>
          ))}
        </div>
      </div>

      {tools.length > 0 && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer font-medium">Tool calls ({tools.length})</summary>
          <pre className="mt-3 text-xs overflow-x-auto">{JSON.stringify(tools, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
```

---

## 11. Twilio Setup

### 11.1 Buy a number

In the Twilio console: Phone Numbers → Buy a Number → pick a US local number with Voice + SMS.

### 11.2 Configure for Vapi

Once you've created your Vapi assistant, in Vapi: Phone Numbers → Import Twilio Number. Provide your Twilio SID, Auth Token, and the phone number SID. Vapi will automatically configure the Twilio voice webhook to point to Vapi's SIP handler.

### 11.3 SMS

SMS doesn't need a webhook for outbound (you trigger sends from your backend). For inbound SMS replies (STOP/HELP), point Twilio's SMS webhook at your backend later in v2 — not needed for MVP.

---

## 12. Deployment

### 12.1 Backend (Fly.io)

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @medspa/api build

FROM node:20-alpine
WORKDIR /app
COPY --from=base /app .
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
```

```toml
# apps/api/fly.toml
app = "medspa-api"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[http_service]
internal_port = 3001
force_https = true
auto_stop_machines = false
auto_start_machines = true
min_machines_running = 1

[[vm]]
size = "shared-cpu-1x"
memory = "512mb"
```

Deploy: `fly deploy --app medspa-api`. Set secrets with `fly secrets set DATABASE_URL=… VAPI_API_KEY=… etc.`

### 12.2 Dashboard (Vercel)

Connect the GitHub repo, set the root to `apps/dashboard`, set env vars (`NEXT_PUBLIC_API_URL`, Clerk keys), deploy.

### 12.3 Database (Supabase)

Create a free project, get the connection string, run migrations:

```bash
pnpm --filter @medspa/db drizzle-kit push
pnpm --filter @medspa/db tsx seed.ts
```

### 12.4 Vapi assistant deploy

```bash
pnpm tsx infra/vapi/deploy.ts
```

Update your spa row with the returned assistant ID.

---

## 13. Environment Variables

```bash
# .env.example
NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# Database
DATABASE_URL=postgres://...

# Demo spa
DEMO_SPA_ID=<UUID from seed output>

# Vapi
VAPI_API_KEY=<from vapi.ai dashboard>
VAPI_WEBHOOK_SECRET=<long random string you generate>
VAPI_ASSISTANT_ID=<populated after first deploy>

# Tool auth (Vapi → backend)
TOOL_AUTH_SECRET=<long random string>

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+15555550100

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=medspa-recordings

# URLs
DASHBOARD_URL=https://dashboard.yourdomain.com
API_BASE_URL=https://api.yourdomain.com

# Optional
SENTRY_DSN=https://...
```

Generate secrets: `openssl rand -hex 32`

---

## 14. 4-Week Build Plan

### Week 1: Skeleton + voice
**Goal:** A demo call reaches an LLM and responds, no real booking yet.

- **Day 1-2:** Repo setup (monorepo, pnpm, Turbo, TypeScript), env files, Supabase project
- **Day 3:** Drizzle schema, migrations, seed script. Verify demo data
- **Day 4:** Twilio number purchase, Vapi account, basic assistant with hardcoded prompt and no tools (just talks)
- **Day 5:** First test call. Tune voice, latency, first-message greeting
- **Weekend:** Iterate on system prompt; just get the tone right

**End state:** You can call the number, Maya answers warmly, holds a conversation, and hangs up gracefully.

### Week 2: Tools + booking flow
**Goal:** Real bookings happen against the demo DB.

- **Day 6:** Fastify scaffold + auth middleware + Vapi webhook receiver (just logs)
- **Day 7-8:** Implement `lookup_client`, `list_services` tools. Wire into Vapi assistant.
- **Day 9-10:** Implement `get_availability`. This will eat the most time — the date parsing and slot generation are fiddly.
- **Day 11:** Implement `create_appointment` + `transfer_to_human`
- **Day 12:** End-to-end test calls; iterate on prompt to guide tool usage

**End state:** A demo call results in a booking row in Postgres + SMS confirmation arriving at the caller's phone.

### Week 3: Dashboard + recordings
**Goal:** Salespeople can show the dashboard during the demo.

- **Day 13:** Next.js scaffold, Clerk auth, layout
- **Day 14:** Home (ROI), Calls list, Call detail pages
- **Day 15:** Bookings page, Settings page
- **Day 16-17:** **Live call view with SSE.** The most important demo screen.
- **Day 18:** Recording download + storage in R2, audio playback in call detail
- **Day 19:** Polish: empty states, loading states, error boundaries

**End state:** A prospect can sit next to you while you call the agent; they see their own call appear live in the dashboard. This is the closer.

### Week 4: Polish + sales prep
**Goal:** Ready to demo to real prospects.

- **Day 20:** Deploy to production (Fly + Vercel + Supabase prod project)
- **Day 21:** Sentry, monitoring, logging cleanup
- **Day 22-23:** **Iterate on the system prompt with 20+ real test calls**, fix issues found
- **Day 24:** Loom recording of a perfect demo call for cold outreach
- **Day 25:** Landing page (one-pager: pitch, video, pricing, Calendly link)
- **Day 26:** Cold outreach prep: 100 med spa Instagram DMs / emails drafted, prospect list built
- **Weekend:** Start booking demos

**End state:** Production-ready demo, live URL, marketing site, first 10 demo calls booked.

---

## 15. Demo Script

When demoing to a prospect on Zoom:

1. **Set the scene (30 sec):** "I'm going to call our demo spa, Aura. Imagine you're a client looking to book a Botox appointment. I'll put it on speaker."

2. **Open the dashboard live view in screen-share.**

3. **Make the call from your phone.** Stay quiet for the greeting. Watch the prospect's face when the agent answers naturally.

4. **Have the booking conversation:** ask about Botox pricing, ask for an evening slot Thursday, give them your name. Let the prospect see the live transcript appearing on screen as you speak.

5. **Hang up.** Wait 5 seconds. Click into the call detail. Show the recording, transcript, and the new booking that just appeared.

6. **Show the home dashboard.** "This is what your front desk manager sees every Monday — calls answered, bookings, revenue captured."

7. **The pitch:** "This is what runs 24/7 for our clients. Average med spa misses 25-40% of inbound calls. We capture every one. Clients typically see 8-15 new bookings a month from this — that's $3-8K in recovered revenue. We're $1,500/mo for spas under 20 employees, $2,500 for larger. Direct integration with Boulevard or your PMS is in our next release; for now we deliver bookings to your front desk via SMS. Want to be one of our first 5 launch clients with locked-in pricing?"

The whole demo runs 8-10 minutes. The live view is the closer.

---

## 16. Post-MVP Roadmap

### v1.5 (weeks 5-6, after first signed client)
- Real PMS adapter: Boulevard (GraphQL Admin API)
- Tier D handoff adapter (SMS to front desk for non-Boulevard spas)
- Per-spa configuration in dashboard

### v2 (weeks 7-10)
- Payment integration: Boulevard Payments + Stripe Connect (SMS payment links)
- Outbound campaigns: missed-call callback, no-show rebook, 90-day reactivation
- Spanish language support
- Mindbody adapter

### v3 (months 3-6)
- Multi-tenant production architecture (proper RLS, per-spa Twilio numbers)
- Vagaro + Mangomint + Aesthetic Record adapters
- Cal.com integration (Tier C)
- Advanced analytics, A/B testing prompts
- Compliance: BAAs with vendors, HIPAA-compliant infrastructure

### Architectural seams to preserve from MVP
- The `PMSAdapter` interface in `apps/api/src/adapters/types.ts` — add `createPaymentLink`, `lookupAppointment` methods later
- The spa config schema — add `payment_provider`, `requires_card_on_file` fields now (set to null), use later
- The tool endpoints — they should never reference `DemoDbAdapter` directly; always use the abstract `pms` import

If you follow this discipline in MVP, v2 and v3 are adding implementations to existing seams — not refactoring the architecture.

---

## Quick start (after first read)

```bash
# 1. Clone & install
git clone <your repo> && cd medspa-agent
pnpm install

# 2. Spin up Supabase project, get DATABASE_URL
# 3. Copy .env.example to .env, fill in all values

# 4. Migrate & seed
pnpm --filter @medspa/db push
pnpm --filter @medspa/db tsx seed.ts
# Copy the printed spa ID into DEMO_SPA_ID

# 5. Deploy Vapi assistant
pnpm tsx infra/vapi/deploy.ts
# Copy printed assistant ID into VAPI_ASSISTANT_ID

# 6. Run dev servers
pnpm --filter @medspa/api dev    # http://localhost:3001
pnpm --filter @medspa/dashboard dev  # http://localhost:3000

# 7. For the agent to reach your local backend, use ngrok or tunnel:
ngrok http 3001
# Update Vapi assistant tool URLs + serverUrl to the ngrok URL

# 8. Call your Twilio number from your phone. The agent answers.
```

---

**End of document.** Total: ~4 weeks of focused work for one developer, ~$50/mo in infrastructure for the demo, ready to show prospects and close deals.
