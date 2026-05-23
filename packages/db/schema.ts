// packages/db/schema.ts
import {
  pgTable, uuid, text, timestamp, integer,
  boolean, jsonb, real, pgEnum
} from 'drizzle-orm/pg-core';

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
