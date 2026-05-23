// apps/api/src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import * as Sentry from '@sentry/node';
import { env } from './env';
import { registerToolRoutes } from './tools';
import { registerWebhookRoutes } from './webhooks/vapi';
import { registerDashboardRoutes } from './dashboard';

Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
  trustProxy: true,
  bodyLimit: 5 * 1024 * 1024, // 5MB for transcript payloads
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(cors, {
  origin: [env.DASHBOARD_URL, 'http://localhost:3000'],
  credentials: true,
});
await app.register(sensible);

app.get('/healthz', async () => ({ ok: true, ts: new Date().toISOString() }));

await app.register(registerToolRoutes, { prefix: '/v1/tools' });
await app.register(registerWebhookRoutes, { prefix: '/v1/webhooks' });
await app.register(registerDashboardRoutes, { prefix: '/v1/dashboard' });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  Sentry.captureException(err);
  app.log.error(err);
  reply.status(err.statusCode ?? 500).send({ error: err.message });
});

await app.listen({ host: '0.0.0.0', port: env.PORT });
console.log(`🚀 API on :${env.PORT}`);
