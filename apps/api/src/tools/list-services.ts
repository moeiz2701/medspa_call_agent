// apps/api/src/tools/list-services.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { VapiToolRequestSchema } from '@medspa/shared';
import { env } from '../env';
import { pms } from '../adapters/demo-db';
import { logToolCall } from '../lib/logging';

const ArgsSchema = z.object({ category: z.string().optional() });

export async function listServicesRoute(app: FastifyInstance) {
  app.post('/list_services', async (req) => {
    const start = Date.now();
    const parsed = VapiToolRequestSchema.parse(req.body);
    const tc = parsed.message.toolCalls[0]!;
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));

    const services = await pms.listServices(env.DEMO_SPA_ID, { category: args.category });

    const lines = services.map((svc) => {
      let line = `${svc.name} (${svc.durationMinutes} min)`;
      if (svc.priceFrom !== null) {
        if (svc.priceFrom === 0) line += ' - FREE';
        else if (svc.priceFrom === svc.priceTo)
          line += ` - $${svc.priceFrom} ${svc.priceUnit ?? ''}`;
        else line += ` - $${svc.priceFrom}-$${svc.priceTo} ${svc.priceUnit ?? ''}`;
      }
      if (svc.requiresConsult) line += ' [requires consult for new clients]';
      return line;
    });

    const result = lines.length
      ? `Services${args.category ? ` (${args.category})` : ''}:\n${lines.join('\n')}`
      : 'No matching services found.';

    await logToolCall({
      vapiCallId: parsed.message.call.id,
      toolName: 'list_services',
      args,
      result: { count: services.length },
      durationMs: Date.now() - start,
    });

    return { results: [{ toolCallId: tc.id, result }] };
  });
}
