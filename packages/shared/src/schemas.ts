// packages/shared/src/schemas.ts
import { z } from 'zod';

/**
 * Shape Vapi POSTs to a tool endpoint. `arguments` is normally a JSON string,
 * but newer Vapi versions send an already-parsed object — accept both and
 * normalize to a string so existing tool handlers (which JSON.parse it) work.
 */
export const VapiToolRequestSchema = z.object({
  message: z.object({
    type: z.string().optional(),
    call: z.object({
      id: z.string(),
      customer: z.object({ number: z.string() }).optional(),
      phoneNumber: z.object({ number: z.string() }).optional(),
      startedAt: z.string().optional(),
    }),
    toolCalls: z.array(
      z.object({
        id: z.string(),
        function: z.object({
          name: z.string(),
          arguments: z
            .union([z.string(), z.record(z.any())])
            .transform((v) => (typeof v === 'string' ? v : JSON.stringify(v))),
        }),
      })
    ),
  }),
});

export type VapiToolRequest = z.infer<typeof VapiToolRequestSchema>;

/** A single tool result entry returned to Vapi. */
export interface VapiToolResult {
  toolCallId: string;
  result: string | Record<string, unknown>;
}
