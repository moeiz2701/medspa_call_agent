'use client';
// apps/dashboard/lib/api.ts
import { useEffect, useState } from 'react';
import type { DashboardStats, LiveEvent } from '@medspa/shared';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

export interface CallRow {
  id: string;
  fromNumber: string;
  startedAt: string;
  durationSeconds: number | null;
  outcome: string;
  summary: string | null;
  recordingUrl: string | null;
}

export interface CallDetail {
  call: CallRow & Record<string, unknown>;
  transcript: { id: string; role: string; content: string; timestamp: string }[];
  tools: Record<string, unknown>[];
}

export interface BookingRow {
  appointment: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    estimatedValue: number | null;
    createdAt: string;
  };
  serviceName: string;
  providerName: string;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientPhone: string;
}

export const fetchStats = () => getJson<DashboardStats>('/v1/dashboard/stats');
export const fetchCalls = (limit = 50) => getJson<CallRow[]>(`/v1/dashboard/calls?limit=${limit}`);
export const fetchCall = (id: string) => getJson<CallDetail>(`/v1/dashboard/calls/${id}`);
export const fetchBookings = () => getJson<BookingRow[]>('/v1/dashboard/bookings');

// SSE hook for the live view
export function useLiveStream() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  useEffect(() => {
    const es = new EventSource(`${API}/v1/dashboard/live`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as LiveEvent;
      setEvents((prev) => [...prev, data].slice(-200));
    };
    return () => es.close();
  }, []);
  return events;
}
