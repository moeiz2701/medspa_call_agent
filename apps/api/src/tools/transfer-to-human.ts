// apps/api/src/tools/transfer-to-human.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db';
import { env } from '../env';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';
import { VapiToolRequestSchema } from '@medspa/shared';
import { logToolCall } from '../lib/logging';

const ArgsSchema = z.object({ reason: z.string() });

export async function transferToHumanRoute(app: FastifyInstance) {
  app.post('/transfer_to_human', async (req) => {
    const parsed = VapiToolRequestSchema.parse(req.body);
    const tc = parsed.message.toolCalls[0]!;
    const args = ArgsSchema.parse(JSON.parse(tc.function.arguments || '{}'));

    const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, env.DEMO_SPA_ID));
    const transferNumber = spa?.transferNumber;

    if (!transferNumber) {
      return {
        results: [
          {
            toolCallId: tc.id,
            result: 'No transfer number configured. Apologize and offer a callback.',
          },
        ],
      };
    }

    await db
      .update(s.calls)
      .set({ outcome: 'transferred', summary: `Transferred: ${args.reason}` })
      .where(eq(s.calls.vapiCallId, parsed.message.call.id));

    await logToolCall({
      vapiCallId: parsed.message.call.id,
      toolName: 'transfer_to_human',
      args,
      result: { transferNumber },
      durationMs: 0,
    });

    // Vapi's transfer destination response shape
    return {
      results: [
        {
          toolCallId: tc.id,
          result: { destination: { type: 'number', number: transferNumber } },
        },
      ],
    };
  });
}
