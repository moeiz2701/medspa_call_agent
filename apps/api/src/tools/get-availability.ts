// apps/api/src/tools/get-availability.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDays, startOfDay, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { VapiToolRequestSchema } from '@medspa/shared';
import { env } from '../env';
import { pms } from '../adapters/demo-db';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { logToolCall } from '../lib/logging';
import type { TimeSlot } from '../adapters/types';

type TodBand = 'morning' | 'afternoon' | 'evening' | 'late';

function bandFor(date: Date, tz: string): TodBand {
  const h = toZonedTime(date, tz).getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'late';
}

function formatSlot(slot: TimeSlot, tz: string): string {
  const local = toZonedTime(slot.startsAt, tz);
  const band = bandFor(slot.startsAt, tz);
  const bandLabel = band.charAt(0).toUpperCase() + band.slice(1);
  const dayLabel = format(local, 'EEEE, MMM d');
  const timeLabel = format(local, 'h:mm a');
  return `- ${bandLabel}: ${dayLabel} at ${timeLabel} with ${slot.providerName} (slot ID: ${slot.startsAt.toISOString()})`;
}

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
  if (lower.includes('tomorrow'))
    return { start: addDays(todayStart, 1), end: addDays(todayStart, 2) };
  if (lower.includes('this week')) return { start: todayStart, end: addDays(todayStart, 7) };
  if (lower.includes('next week'))
    return { start: addDays(todayStart, 7), end: addDays(todayStart, 14) };
  // Day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i]!)) {
      const dow = nowLocal.getDay();
      let delta = (i - dow + 7) % 7;
      if (delta === 0) delta = 7;
      const target = addDays(todayStart, delta);
      return { start: target, end: addDays(target, 1) };
    }
  }
  return { start: todayStart, end: addDays(todayStart, 14) };
}

function filterByTimeOfDay(slots: TimeSlot[], tod: string | undefined, tz: string) {
  if (!tod || tod === 'any') return slots;
  return slots.filter((slot) => {
    const local = toZonedTime(slot.startsAt, tz);
    const h = local.getHours();
    if (tod === 'morning') return h >= 6 && h < 12;
    if (tod === 'afternoon') return h >= 12 && h < 17;
    if (tod === 'evening') return h >= 17 && h < 22;
    return true;
  });
}

export async function getAvailabilityRoute(app: FastifyInstance) {
  app.post('/get_availability', async (req) => {
    const start = Date.now();
    const parsed = VapiToolRequestSchema.parse(req.body);
    const tc = parsed.message.toolCalls[0]!;
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));

    const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, env.DEMO_SPA_ID));
    if (!spa) {
      return {
        results: [{ toolCallId: tc.id, result: 'Spa not configured. Transfer to human.' }],
      };
    }
    const tz = spa.timezone;

    // Fuzzy match service name (LLMs sometimes paraphrase)
    const [service] = await db
      .select()
      .from(s.services)
      .where(
        and(
          eq(s.services.spaId, env.DEMO_SPA_ID),
          ilike(s.services.name, `%${args.service_name}%`),
        ),
      )
      .limit(1);

    if (!service) {
      return {
        results: [
          {
            toolCallId: tc.id,
            result: `Couldn't find a service matching "${args.service_name}". Please call list_services and pick an exact name.`,
          },
        ],
      };
    }

    // Optional provider filter
    let providerId: string | undefined;
    if (args.provider_name) {
      const [p] = await db
        .select()
        .from(s.providers)
        .where(
          and(
            eq(s.providers.spaId, env.DEMO_SPA_ID),
            ilike(s.providers.name, `%${args.provider_name}%`),
          ),
        )
        .limit(1);
      if (p) providerId = p.id;
    }

    const range = parsePreferredDay(args.preferred_day, tz);
    const dayUnfiltered = await pms.getAvailability({
      spaId: env.DEMO_SPA_ID,
      serviceId: service.id,
      providerId,
      rangeStart: range.start,
      rangeEnd: range.end,
      maxSlots: 24,
    });
    const dayPreferred = filterByTimeOfDay(
      dayUnfiltered,
      args.preferred_time_of_day,
      tz,
    );
    const todPretty =
      args.preferred_time_of_day && args.preferred_time_of_day !== 'any'
        ? args.preferred_time_of_day
        : null;
    const dayLabel = args.preferred_day ? ` ${args.preferred_day}` : '';

    let result: string;
    let slotsReturned = 0;

    if (dayPreferred.length > 0) {
      const preferred = dayPreferred.slice(0, 4);
      slotsReturned = preferred.length;
      const formatted = preferred.map((sl) => formatSlot(sl, tz)).join('\n');
      result = `Available slots for ${service.name}${dayLabel}${
        todPretty ? ` (${todPretty})` : ''
      }:\n${formatted}\n\nOffer 2 of these to the caller. Use the ISO slot ID exactly as starts_at_iso when calling create_appointment.`;
    } else if (todPretty && dayUnfiltered.length > 0) {
      // Caller's preferred time-of-day is booked, but day has openings.
      const alts = dayUnfiltered.slice(0, 4);
      slotsReturned = alts.length;
      const formatted = alts.map((sl) => formatSlot(sl, tz)).join('\n');
      result = `NO ${todPretty.toUpperCase()} SLOTS available${dayLabel} for ${service.name}. Other openings that same day:\n${formatted}\n\nTell the caller their preferred time is booked and offer 2 of these alternatives. Use the ISO slot ID exactly when calling create_appointment.`;
    } else {
      // Whole day (or window) is booked — widen the search.
      const widerEnd = addDays(range.end, 14);
      const wider = await pms.getAvailability({
        spaId: env.DEMO_SPA_ID,
        serviceId: service.id,
        providerId,
        rangeStart: range.end,
        rangeEnd: widerEnd,
        maxSlots: 12,
      });
      const widerPreferred =
        todPretty ? filterByTimeOfDay(wider, args.preferred_time_of_day, tz) : wider;
      const chosen = (widerPreferred.length > 0 ? widerPreferred : wider).slice(0, 4);
      slotsReturned = chosen.length;
      if (chosen.length === 0) {
        result = `FULLY BOOKED${dayLabel}${
          todPretty ? ` for ${todPretty}` : ''
        } and the next two weeks for ${service.name}. Apologize and offer to take a callback number via transfer_to_human.`;
      } else {
        const formatted = chosen.map((sl) => formatSlot(sl, tz)).join('\n');
        result = `NOTHING AVAILABLE${dayLabel}${
          todPretty ? ` (${todPretty})` : ''
        } for ${service.name}. The next openings are:\n${formatted}\n\nTell the caller their requested window is full and offer 2 of these. Use the ISO slot ID exactly when calling create_appointment.`;
      }
    }

    await logToolCall({
      vapiCallId: parsed.message.call.id,
      toolName: 'get_availability',
      args,
      result: { count: slotsReturned },
      durationMs: Date.now() - start,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
