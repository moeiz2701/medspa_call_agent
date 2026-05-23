// apps/api/src/dashboard/live.ts
import type { FastifyInstance } from 'fastify';
import { liveBus } from '../lib/events';
import type { LiveEvent } from '@medspa/shared';

export async function registerLiveRoute(app: FastifyInstance) {
  // GET /v1/dashboard/live (Server-Sent Events)
  app.get('/live', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: LiveEvent | { type: string; ts: string }) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'connected', ts: new Date().toISOString() });

    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15_000);
    const unsubscribe = liveBus.subscribe(send);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
