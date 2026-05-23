// apps/api/src/dashboard/index.ts
import type { FastifyInstance } from 'fastify';
import { registerStatsRoute } from './stats';
import { registerCallsRoutes } from './calls';
import { registerBookingsRoute } from './bookings';
import { registerLiveRoute } from './live';

export async function registerDashboardRoutes(app: FastifyInstance) {
  await registerStatsRoute(app);
  await registerCallsRoutes(app);
  await registerBookingsRoute(app);
  await registerLiveRoute(app);
}
