// apps/api/src/db.ts
// The guide imports the Drizzle client as `../db`. We keep one source of
// truth in the @medspa/db package and re-export it here so every guide
// import path (`import { db } from '../db'`) resolves correctly.
export { db } from '@medspa/db/client';
export type { DB } from '@medspa/db/client';
