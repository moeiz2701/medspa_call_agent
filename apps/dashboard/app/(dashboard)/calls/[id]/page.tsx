'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchCall } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Show times in the spa's timezone (see bookings/page.tsx for full reasoning).
const SPA_TZ = 'America/New_York';
const spaDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: SPA_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery({ queryKey: ['call', id], queryFn: () => fetchCall(id) });
  if (!data) return <div className="p-8 text-white/80">Loading…</div>;
  const { call, transcript, tools } = data;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5 md:space-y-6">
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
      >
        <ArrowLeft size={14} /> Back to calls
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-white drop-shadow-sm">
          Call detail
        </h1>
        <p className="text-sm text-white/75">
          {call.fromNumber} &bull; {spaDateTime.format(new Date(call.startedAt))} ET
        </p>
      </div>

      {call.recordingUrl && (
        <div className="glass-strong p-4 md:p-5">
          <h2 className="mb-2 font-medium text-aura-ink">Recording</h2>
          <audio controls src={call.recordingUrl} className="w-full" />
        </div>
      )}

      <div className="glass-strong p-5 md:p-6">
        <h2 className="mb-4 font-medium text-aura-ink">Transcript</h2>
        <div className="space-y-3">
          {transcript.map((t) => {
            const isAssistant = t.role === 'assistant';
            return (
              <div
                key={t.id}
                className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                    isAssistant
                      ? 'bg-gradient-to-br from-aura-rose to-aura-magenta text-white'
                      : 'bg-white/10 text-aura-ink ring-1 ring-white/15'
                  }`}
                >
                  <div
                    className={`mb-1 text-[10px] uppercase tracking-wider ${
                      isAssistant ? 'text-white/70' : 'text-aura-ink/55'
                    }`}
                  >
                    {isAssistant ? 'Maya' : 'Caller'}
                  </div>
                  {t.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tools.length > 0 && (
        <details className="glass-strong p-4 md:p-5">
          <summary className="cursor-pointer font-medium text-aura-ink">
            Tool calls ({tools.length})
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-aura-night/60 p-3 text-xs text-aura-ink ring-1 ring-white/10">
            {JSON.stringify(tools, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
