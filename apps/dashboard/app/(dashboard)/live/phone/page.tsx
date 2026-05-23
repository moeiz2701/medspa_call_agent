'use client';

import { useLiveStream } from '@/lib/api';
import { useMemo } from 'react';
import { PhoneIncoming } from 'lucide-react';

interface Turn {
  role: string;
  content: string;
}
interface ActiveCall {
  id: string;
  from: string;
  turns: Turn[];
  ended?: boolean;
  outcome?: string;
}

export default function LivePhonePage() {
  const events = useLiveStream();

  const activeCalls = useMemo(() => {
    const map = new Map<string, ActiveCall>();
    for (const ev of events) {
      if (ev.type === 'call.started') {
        map.set(ev.callId, { id: ev.callId, from: ev.from, turns: [] });
      } else if (ev.type === 'call.transcript') {
        const c = map.get(ev.callId);
        if (c) c.turns.push({ role: ev.role, content: ev.content });
      } else if (ev.type === 'call.ended') {
        const c = map.get(ev.callId);
        if (c) {
          c.ended = true;
          c.outcome = ev.outcome;
        }
      }
    }
    return Array.from(map.values()).reverse();
  }, [events]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-white drop-shadow-sm">
          Phone calls
        </h1>
        <p className="text-sm text-white/75">
          Real-time view of inbound phone calls hitting the AI front desk.
        </p>
      </header>

      {activeCalls.length === 0 && (
        <div className="glass-strong p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-aura-pink/20 text-aura-pink ring-1 ring-aura-pink/40">
            <PhoneIncoming size={20} />
          </div>
          <div className="font-medium text-aura-ink">No active phone calls</div>
          <p className="mt-1 text-sm text-aura-ink/65">
            Dial the spa number to see a live call light up here. The inbound
            phone interface is coming soon &mdash; for now you can use the
            browser demo to talk to Maya.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {activeCalls.map((call) => (
          <div key={call.id} className="glass-strong p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-aura-ink/55">
                  Caller
                </div>
                <div className="font-medium text-aura-ink">{call.from}</div>
              </div>
              <div
                className={`chip ${
                  call.ended
                    ? 'bg-white/10 text-aura-ink/70 ring-1 ring-white/20'
                    : 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40'
                }`}
              >
                {call.ended ? `Ended · ${call.outcome ?? '—'}` : '● Live'}
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {call.turns.map((t, i) => {
                const isAssistant = t.role === 'assistant';
                return (
                  <div
                    key={i}
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
        ))}
      </div>
    </div>
  );
}
