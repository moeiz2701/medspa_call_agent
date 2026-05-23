// packages/shared/src/types.ts

export type CallDirection = 'inbound' | 'outbound';

export type CallOutcome =
  | 'booked'
  | 'transferred'
  | 'info_only'
  | 'voicemail'
  | 'failed'
  | 'in_progress';

export type AppointmentStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type ServiceCategory =
  | 'injectables'
  | 'laser'
  | 'facial'
  | 'body'
  | 'wellness';

/** Dashboard ROI summary returned by GET /v1/dashboard/stats */
export interface DashboardStats {
  callsAnswered: number;
  bookingsMade: number;
  revenueCaptured: number;
  avgCallSeconds: number;
  conversionRate: number;
}

/** Live SSE event payloads pushed to the dashboard live view. */
export type LiveEvent =
  | { type: 'connected'; ts: string }
  | { type: 'call.started'; callId: string; from: string }
  | { type: 'call.transcript'; callId: string; role: string; content: string }
  | { type: 'call.tool'; callId: string; tool: string; args: unknown; result: unknown }
  | { type: 'call.ended'; callId: string; outcome: string; durationSec: number }
  | { type: 'booking.created'; appointmentId: string; serviceName: string; startsAt: string };
