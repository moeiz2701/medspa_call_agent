// apps/api/src/tools/index.ts
import type { FastifyInstance } from 'fastify';
import { env } from '../env';
import { lookupClientRoute } from './lookup-client';
import { listServicesRoute } from './list-services';
import { getAvailabilityRoute } from './get-availability';
import { createAppointmentRoute } from './create-appointment';
import { transferToHumanRoute } from './transfer-to-human';

export async function registerToolRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const auth = req.headers['x-vapi-secret'];
    if (auth !== env.TOOL_AUTH_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  await lookupClientRoute(app);
  await listServicesRoute(app);
  await getAvailabilityRoute(app);
  await createAppointmentRoute(app);
  await transferToHumanRoute(app);
}
