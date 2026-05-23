// packages/db/drizzle.config.ts
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env') });

export default defineConfig({
  schema: './schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
