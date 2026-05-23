// infra/vapi/deploy.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env') });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

async function main() {
  if (!VAPI_API_KEY) throw new Error('VAPI_API_KEY is not set');
  if (!process.env.API_BASE_URL) throw new Error('API_BASE_URL is not set');
  if (!process.env.VAPI_WEBHOOK_SECRET) throw new Error('VAPI_WEBHOOK_SECRET is not set');

  const config = JSON.parse(fs.readFileSync(path.join(here, 'assistant.json'), 'utf-8'));
  const systemPrompt = fs.readFileSync(
    path.resolve(here, '../../packages/prompts/agent-system.md'),
    'utf-8'
  );
  config.model.systemPrompt = systemPrompt;
  config.serverUrlSecret = process.env.VAPI_WEBHOOK_SECRET;
  config.serverUrl = config.serverUrl.replace('https://api.yourdomain.com', process.env.API_BASE_URL);
  for (const t of config.model.tools) {
    t.server.url = t.server.url.replace('https://api.yourdomain.com', process.env.API_BASE_URL);
  }

  const url = ASSISTANT_ID
    ? `https://api.vapi.ai/assistant/${ASSISTANT_ID}`
    : 'https://api.vapi.ai/assistant';
  const method = ASSISTANT_ID ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VAPI_API_KEY}` },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    console.error('❌ Failed:', await res.text());
    process.exit(1);
  }
  const data = await res.json();
  console.log(`✅ Assistant ${ASSISTANT_ID ? 'updated' : 'created'}:`, data.id);
  if (!ASSISTANT_ID) {
    console.log(`   Set VAPI_ASSISTANT_ID=${data.id} in your .env`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
