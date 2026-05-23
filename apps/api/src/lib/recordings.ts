// apps/api/src/lib/recordings.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { eq } from 'drizzle-orm';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const PRESIGN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Deviation from guide §9.1: the guide stored
 * `https://{bucket}.{accountId}.r2.cloudflarestorage.com/{key}` which is NOT
 * a publicly fetchable URL (that host requires SigV4 auth). We instead store
 * a usable URL: the configured public base (r2.dev / custom domain) if set,
 * otherwise a presigned GET URL valid for 7 days — plenty for a demo.
 */
export async function downloadRecording(vapiRecordingUrl: string, callId: string) {
  const res = await fetch(vapiRecordingUrl);
  if (!res.ok) throw new Error(`Failed to fetch recording: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = `recordings/${callId}.mp3`;

  await r2.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'audio/mpeg',
  }));

  const url = env.R2_PUBLIC_BASE_URL
    ? `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
    : await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
        { expiresIn: PRESIGN_TTL_SECONDS },
      );

  await db.update(s.calls).set({ recordingUrl: url }).where(eq(s.calls.id, callId));
}
