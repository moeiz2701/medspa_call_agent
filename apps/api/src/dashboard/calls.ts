// apps/api/src/dashboard/calls.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from '../env';

export async function registerCallsRoutes(app: FastifyInstance) {
  // GET /v1/dashboard/calls?limit=20
  app.get<{ Querystring: { limit?: string } }>('/calls', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
    const rows = await db
      .select()
      .from(s.calls)
      .where(eq(s.calls.spaId, env.DEMO_SPA_ID))
      .orderBy(desc(s.calls.startedAt))
      .limit(limit);
    return rows;
  });

  // GET /v1/dashboard/calls/:id
  app.get<{ Params: { id: string } }>('/calls/:id', async (req) => {
    const [call] = await db.select().from(s.calls).where(eq(s.calls.id, req.params.id));
    if (!call) throw app.httpErrors.notFound();
    const transcript = await db
      .select()
      .from(s.callTranscripts)
      .where(eq(s.callTranscripts.callId, call.id))
      .orderBy(s.callTranscripts.timestamp);
    const tools = await db
      .select()
      .from(s.toolCalls)
      .where(eq(s.toolCalls.callId, call.id))
      .orderBy(s.toolCalls.timestamp);
    return { call, transcript, tools };
  });
}
