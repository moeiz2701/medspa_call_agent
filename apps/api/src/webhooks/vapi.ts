// apps/api/src/webhooks/vapi.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { env } from '../env';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';
import { liveBus } from '../lib/events';
import { downloadRecording } from '../lib/recordings';

/**
 * Deviation from guide §9: typed the webhook payload instead of `req: any`.
 * Vapi sends several `message.type`s to one endpoint; fields are optional
 * across types so we model it permissively.
 */
interface VapiWebhookBody {
  message?: {
    type: string;
    status?: string;
    transcriptType?: string;
    role?: string;
    transcript?: string;
    summary?: string;
    endedAt?: string;
    endedReason?: string;
    durationSeconds?: number;
    cost?: number;
    recordingUrl?: string;
    call: {
      id: string;
      startedAt?: string;
      customer?: { number?: string };
      phoneNumber?: { number?: string };
    };
  };
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/vapi', async (req, reply) => {
    const auth = req.headers['x-vapi-secret'];
    if (auth !== env.VAPI_WEBHOOK_SECRET) return reply.code(401).send();

    const msg = (req.body as VapiWebhookBody).message;
    if (!msg) return reply.send({ ok: true });

    try {
      switch (msg.type) {
        case 'status-update': {
          if (msg.status === 'in-progress') {
            await db
              .insert(s.calls)
              .values({
                spaId: env.DEMO_SPA_ID,
                vapiCallId: msg.call.id,
                direction: 'inbound',
                fromNumber: msg.call.customer?.number ?? 'unknown',
                toNumber: msg.call.phoneNumber?.number ?? 'unknown',
                startedAt: new Date(msg.call.startedAt ?? Date.now()),
                outcome: 'in_progress',
              })
              .onConflictDoNothing();
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
          const [callRow] = await db
            .select()
            .from(s.calls)
            .where(eq(s.calls.vapiCallId, msg.call.id))
            .limit(1);
          if (!callRow) break;
          await db.insert(s.callTranscripts).values({
            callId: callRow.id,
            role: msg.role ?? 'unknown',
            content: msg.transcript ?? '',
          });
          liveBus.publish({
            type: 'call.transcript',
            callId: msg.call.id,
            role: msg.role ?? 'unknown',
            content: msg.transcript ?? '',
          });
          break;
        }

        case 'end-of-call-report': {
          const [callRow] = await db
            .select()
            .from(s.calls)
            .where(eq(s.calls.vapiCallId, msg.call.id))
            .limit(1);
          if (!callRow) break;

          await db
            .update(s.calls)
            .set({
              endedAt: new Date(msg.endedAt ?? Date.now()),
              // Vapi sends fractional seconds (e.g. 77.777); column is integer.
              durationSeconds: Math.round(msg.durationSeconds ?? 0),
              costUsd: msg.cost ?? 0,
              summary: msg.summary ?? null,
              outcome:
                callRow.outcome === 'in_progress'
                  ? msg.endedReason?.includes('customer')
                    ? 'info_only'
                    : 'failed'
                  : callRow.outcome,
            })
            .where(eq(s.calls.id, callRow.id));

          // Download recording asynchronously
          if (msg.recordingUrl) {
            downloadRecording(msg.recordingUrl, callRow.id).catch((e) =>
              app.log.error(e, 'recording download failed'),
            );
          }

          liveBus.publish({
            type: 'call.ended',
            callId: msg.call.id,
            outcome: callRow.outcome,
            durationSec: Math.round(msg.durationSeconds ?? 0),
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
