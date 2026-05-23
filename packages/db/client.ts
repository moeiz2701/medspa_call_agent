// packages/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Single shared client. `prepare: false` keeps it compatible with Supabase's
// transaction pooler; raise `max` later if you move off the pooler.
const queryClient = postgres(DATABASE_URL, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
