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
      result = `No availability found for ${service.name}${
        args.preferred_day ? ` ${args.preferred_day}` : ''
      }. Suggest a different day or provider.`;
    } else {
      const formatted = slots
        .map((slot) => {
          const local = toZonedTime(slot.startsAt, tz);
          const dayLabel = format(local, 'EEEE, MMM d');
          const timeLabel = format(local, 'h:mm a');
          return `- ${dayLabel} at ${timeLabel} with ${slot.providerName} (slot ID: ${slot.startsAt.toISOString()})`;
        })
        .join('\n');
      result = `Available slots for ${service.name}:\n${formatted}\n\nWhen offering to caller, mention only 2 slots. Use the ISO timestamp as starts_at_iso when calling create_appointment.`;
    }

    await logToolCall({
      vapiCallId: parsed.message.call.id,
      toolName: 'get_availability',
      args,
      result: { count: slots.length },
      durationMs: Date.now() - start,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
