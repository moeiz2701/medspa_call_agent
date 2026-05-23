'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchCalls } from '@/lib/api';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

const outcomeBadges: Record<string, string> = {
  booked: 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40',
  transferred: 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40',
  info_only: 'bg-white/10 text-white/90 ring-1 ring-white/20',
  voicemail: 'bg-aura-sky/25 text-aura-sky ring-1 ring-aura-sky/40',
  failed: 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/40',
  in_progress: 'bg-aura-pink/25 text-aura-pink ring-1 ring-aura-pink/50',
};

export default function CallsPage() {
  const { data: calls } = useQuery({
    queryKey: ['calls'],
    queryFn: () => fetchCalls(100),
    refetchInterval: 10_000,
  });
  if (!calls) return <div className="p-8 text-white/80">Loading…</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="mb-6 text-2xl md:text-3xl font-semibold text-white drop-shadow-sm">
        Calls
      </h1>

      {/* Desktop table */}
      <div className="glass-strong hidden md:block overflow-hidden">
        <table className="w-full text-aura-ink">
          <thead className="bg-white/5 text-aura-ink/60">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">From</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">When</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Duration</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Outcome</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr
                key={c.id}
                className="border-t border-white/10 hover:bg-white/[0.06]"
              >
                <td className="p-3 font-mono text-sm">{c.fromNumber}</td>
                <td className="p-3 text-sm">
                  {formatDistanceToNow(new Date(c.startedAt), { addSuffix: true })}
                </td>
                <td className="p-3 text-sm">
                  {c.durationSeconds ? `${c.durationSeconds}s` : '—'}
                </td>
                <td className="p-3">
                  <span
                    className={`chip ${
                      outcomeBadges[c.outcome] ?? 'bg-white/10 text-white/90 ring-1 ring-white/20'
                    }`}
                  >
                    {c.outcome.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-3 text-sm text-aura-ink/80">
                  <Link
                    href={`/calls/${c.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {c.summary?.slice(0, 60) ?? 'View'}
                  </Link>
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-aura-ink/50">
                  No calls yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {calls.map((c) => (
          <Link
            key={c.id}
            href={`/calls/${c.id}`}
            className="glass-strong block p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm text-aura-ink">{c.fromNumber}</span>
              <span
                className={`chip ${
                  outcomeBadges[c.outcome] ?? 'bg-white/10 text-white/90 ring-1 ring-white/20'
                }`}
              >
                {c.outcome.replace('_', ' ')}
              </span>
            </div>
            <div className="text-xs text-aura-ink/60">
              {formatDistanceToNow(new Date(c.startedAt), { addSuffix: true })}
              {c.durationSeconds ? ` · ${c.durationSeconds}s` : ''}
            </div>
            {c.summary && (
              <div className="mt-2 line-clamp-2 text-sm text-aura-ink/85">
                {c.summary}
              </div>
            )}
          </Link>
        ))}
        {calls.length === 0 && (
          <div className="glass-strong p-8 text-center text-aura-ink/50">
            No calls yet.
          </div>
        )}
      </div>
    </div>
  );
}
