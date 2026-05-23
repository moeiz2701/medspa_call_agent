// apps/api/src/dashboard/stats.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq, sql, gte, and } from 'drizzle-orm';
import { subDays } from 'date-fns';
import { env } from '../env';

export async function registerStatsRoute(app: FastifyInstance) {
  // GET /v1/dashboard/stats
  app.get('/stats', async () => {
    const since30 = subDays(new Date(), 30);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(s.calls)
      .where(and(eq(s.calls.spaId, env.DEMO_SPA_ID), gte(s.calls.startedAt, since30)));

    const [{ booked }] = await db
      .select({ booked: sql<number>`count(*)::int` })
      .from(s.calls)
      .where(
        and(
          eq(s.calls.spaId, env.DEMO_SPA_ID),
          eq(s.calls.outcome, 'booked'),
          gte(s.calls.startedAt, since30),
        ),
      );

    const [{ revenue }] = await db
      .select({ revenue: sql<number>`coalesce(sum(estimated_value), 0)::float` })
      .from(s.appointments)
      .where(
        and(
          eq(s.appointments.spaId, env.DEMO_SPA_ID),
          gte(s.appointments.createdAt, since30),
        ),
      );

    const [{ avgDur }] = await db
      .select({ avgDur: sql<number>`coalesce(avg(duration_seconds), 0)::float` })
      .from(s.calls)
      .where(and(eq(s.calls.spaId, env.DEMO_SPA_ID), gte(s.calls.startedAt, since30)));

    return {
      callsAnswered: total,
      bookingsMade: booked,
      revenueCaptured: revenue,
      avgCallSeconds: Math.round(avgDur),
      conversionRate: total > 0 ? Math.round((booked / total) * 100) : 0,
    };
  });
}
