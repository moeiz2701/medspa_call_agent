// apps/api/src/tools/lookup-client.ts
import type { FastifyInstance } from 'fastify';
import { VapiToolRequestSchema } from '@medspa/shared';
import { env } from '../env';
import { pms } from '../adapters/demo-db';
import { logToolCall } from '../lib/logging';

export async function lookupClientRoute(app: FastifyInstance) {
  app.post('/lookup_client', async (req, reply) => {
    const start = Date.now();
    const parsed = VapiToolRequestSchema.parse(req.body);
    const tc = parsed.message.toolCalls[0]!;
    const phone = parsed.message.call.customer?.number;

    if (!phone) {
      return reply.send({
        results: [
          { toolCallId: tc.id, result: 'No caller ID available. Treat as new client.' },
        ],
      });
    }

    const client = await pms.lookupClient(env.DEMO_SPA_ID, phone);
    const durationMs = Date.now() - start;

    let result: string;
    if (!client) {
      result = `New client. Caller phone: ${phone}. Treat as first-time visitor.`;
    } else {
      const name = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
      const parts = [`Returning client: ${name}`];
      if (client.preferredProviderName) parts.push(`Prefers ${client.preferredProviderName}`);
      if (client.vipFlag) parts.push('VIP client — treat warmly');
      if (client.notes) parts.push(`Notes for staff (do not read aloud): ${client.notes}`);
      result = parts.join('. ');
    }

    await logToolCall({
      vapiCallId: parsed.message.call.id,
      toolName: 'lookup_client',
      args: { phone },
      result: { found: !!client, clientId: client?.id },
      durationMs,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
