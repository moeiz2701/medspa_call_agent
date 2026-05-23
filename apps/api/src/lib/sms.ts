// apps/api/src/lib/sms.ts
import twilio from 'twilio';
import { env } from '../env';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendSms(to: string, body: string) {
  return client.messages.create({ from: env.TWILIO_FROM_NUMBER, to, body });
}
