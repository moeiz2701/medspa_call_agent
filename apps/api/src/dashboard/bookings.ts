// apps/api/src/dashboard/bookings.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from '../env';

export async function registerBookingsRoute(app: FastifyInstance) {
  // GET /v1/dashboard/bookings
  app.get('/bookings', async () => {
    return db
      .select({
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
}
