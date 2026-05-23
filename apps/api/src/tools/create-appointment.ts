// apps/api/src/tools/create-appointment.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { db } from '../db';
import { env } from '../env';
import * as s from '@medspa/db/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { VapiToolRequestSchema } from '@medspa/shared';
import { pms } from '../adapters/demo-db';
import { sendSms } from '../lib/sms';
import { liveBus } from '../lib/events';
import { logToolCall } from '../lib/logging';

// Normalize empty-string optionals to undefined — LLMs frequently pass "".
const optionalString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? undefined : v));

const ArgsSchema = z.object({
  service_name: z.string().min(1),
  provider_name: z.string().min(1),
  starts_at_iso: z.string().min(1),
  first_name: z.string().min(1),
  last_name: optionalString,
  email: optionalString.pipe(
    z.string().email().optional().or(z.undefined()),
  ),
});

export async function createAppointmentRoute(app: FastifyInstance) {
  app.post('/create_appointment', async (req) => {
    const start = Date.now();
    const parsed = VapiToolRequestSchema.parse(req.body);
    const tc = parsed.message.toolCalls[0]!;
    const vapiCallId = parsed.message.call.id;
    // Web calls (no Twilio leg) have no customer.number. Synthesize a stable
    // identifier from the Vapi call ID so the booking can complete; SMS will
    // no-op for these since Twilio can't deliver to a non-E.164 number.
    const rawPhone = parsed.message.call.customer?.number;
    const phone = rawPhone ?? `web:${vapiCallId}`;
    const isWebCall = !rawPhone;

    let args: z.infer<typeof ArgsSchema>;
    try {
      args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));
    } catch (err) {
      const detail = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : String(err);
      app.log.warn({ detail, raw: tc.function.arguments }, 'create_appointment: bad args from LLM');
      return {
        results: [
          {
            toolCallId: tc.id,
            result: `Missing or invalid info (${detail}). Ask the caller for the missing field and try again. Use the exact ISO timestamp from the most recent get_availability slot for starts_at_iso.`,
          },
        ],
      };
    }

    // Validate the date string parses to a real Date — LLMs sometimes paraphrase.
    const startsAtDate = new Date(args.starts_at_iso);
    if (Number.isNaN(startsAtDate.getTime())) {
      app.log.warn({ starts_at_iso: args.starts_at_iso }, 'create_appointment: invalid date');
      return {
        results: [
          {
            toolCallId: tc.id,
            result: 'The starts_at_iso value is not a valid ISO timestamp. Re-call get_availability and copy a slot ID exactly.',
          },
        ],
      };
    }

    try {
      // Resolve service
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
      if (!service) throw new Error('Service not found');

      // Resolve provider
      const [provider] = await db
        .select()
        .from(s.providers)
        .where(
          and(
            eq(s.providers.spaId, env.DEMO_SPA_ID),
            ilike(s.providers.name, `%${args.provider_name}%`),
          ),
        )
        .limit(1);
      if (!provider) throw new Error('Provider not found');

      // Upsert client
      const client = await pms.upsertClient(env.DEMO_SPA_ID, {
        spaId: env.DEMO_SPA_ID,
        phone,
        firstName: args.first_name,
        lastName: args.last_name,
        email: args.email,
      });

      // Find the call row by Vapi call ID
      const [callRow] = await db
        .select()
        .from(s.calls)
        .where(eq(s.calls.vapiCallId, vapiCallId))
        .limit(1);

      // Create the appointment
      const appt = await pms.createAppointment({
        spaId: env.DEMO_SPA_ID,
        clientId: client.id,
        serviceId: service.id,
        providerId: provider.id,
        startsAt: startsAtDate,
        callId: callRow?.id,
      });

      // Link call to appointment
      if (callRow) {
        await db
          .update(s.calls)
          .set({ outcome: 'booked', appointmentId: appt.id })
          .where(eq(s.calls.id, callRow.id));
      }

      // SMS confirmation (fire-and-forget)
      const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, env.DEMO_SPA_ID));
      const localStart = toZonedTime(appt.startsAt, spa!.timezone);
      const friendlyDate = format(localStart, 'EEEE, MMM d');
      const friendlyTime = format(localStart, 'h:mm a');
      if (!isWebCall) {
        sendSms(
          phone,
          `Hi ${args.first_name}! You're confirmed at ${spa!.name} for ${service.name} with ${provider.name} on ${friendlyDate} at ${friendlyTime}. Address: ${spa!.address}. Reply STOP to opt out.`,
        ).catch((e) => app.log.error(e, 'SMS send failed'));
      }

      // Live event
      liveBus.publish({
        type: 'booking.created',
        appointmentId: appt.id,
        serviceName: appt.serviceName,
        startsAt: appt.startsAt.toISOString(),
      });

      const result = isWebCall
        ? `BOOKED: ${appt.serviceName} with ${appt.providerName} on ${friendlyDate} at ${friendlyTime}. Tell the caller it's confirmed.`
        : `BOOKED: ${appt.serviceName} with ${appt.providerName} on ${friendlyDate} at ${friendlyTime}. SMS confirmation sent to ${phone}. Tell the caller it's confirmed and a text is on the way.`;

      await logToolCall({
        vapiCallId,
        toolName: 'create_appointment',
        args,
        result: { appointmentId: appt.id },
        durationMs: Date.now() - start,
      });
      return { results: [{ toolCallId: tc.id, result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, args }, 'create_appointment failed');
      let userMsg: string;
      if (message === 'SLOT_NO_LONGER_AVAILABLE') {
        userMsg = 'That slot was just booked. Call get_availability again and offer a different time.';
      } else if (message.includes('not found')) {
        userMsg = `Could not find ${message}. Call list_services and verify the exact name.`;
      } else {
        userMsg = 'Booking failed due to a system error. Apologize and offer to take a name + callback number.';
      }
      await logToolCall({
        vapiCallId,
        toolName: 'create_appointment',
        args,
        result: { error: message },
        durationMs: Date.now() - start,
        success: false,
        errorMessage: message,
      });
      return { results: [{ toolCallId: tc.id, result: userMsg }] };
    }
  });
}
