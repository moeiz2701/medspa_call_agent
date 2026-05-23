// apps/api/src/lib/logging.ts
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Deviation from guide §8.8: the guide's helper accepted `success` but never
 * persisted it, and never wrote `errorMessage` even though both columns exist
 * on `tool_calls`. We persist both so the dashboard can surface failures.
 */
export async function logToolCall(input: {
  vapiCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  durationMs: number;
  success?: boolean;
  errorMessage?: string;
}) {
  const [callRow] = await db
    .select()
    .from(s.calls)
    .where(eq(s.calls.vapiCallId, input.vapiCallId))
    .limit(1);
  if (!callRow) return;

  await db.insert(s.toolCalls).values({
    callId: callRow.id,
    toolName: input.toolName,
    argsJson: input.args,
    resultJson: input.result,
    durationMs: input.durationMs,
    success: input.success !== false,
    errorMessage: input.errorMessage ?? null,
  });
}
