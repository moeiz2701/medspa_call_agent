'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchBookings } from '@/lib/api';
import { CalendarDays, Clock, User as UserIcon, Sparkles } from 'lucide-react';

// Render appointment times in the SPA'S timezone, not the viewer's browser tz
// (otherwise "10 AM Eastern" appears as 7 AM on a Pacific machine, 8 PM in
// Karachi, etc.). MVP is single-spa, so the timezone is hardcoded; if/when
// we go multi-spa, include the spa's timezone in the booking API response.
const SPA_TZ = 'America/New_York';
const spaDate = new Intl.DateTimeFormat('en-US', {
  timeZone: SPA_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const spaTime = new Intl.DateTimeFormat('en-US', {
  timeZone: SPA_TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export default function BookingsPage() {
  const { data: bookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: fetchBookings,
    refetchInterval: 15_000,
  });
  if (!bookings) return <div className="p-8 text-white/80">Loading…</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-white drop-shadow-sm">
          Bookings
        </h1>
        <p className="text-sm text-white/75">
          Appointments captured by your AI receptionist.
        </p>
      </header>

      {/* Desktop table */}
      <div className="glass-strong hidden md:block overflow-hidden">
        <table className="w-full text-aura-ink">
          <thead className="bg-white/5 text-aura-ink/60">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Client</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Phone</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Service</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Provider</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">When</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Est. value</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr
                key={b.appointment.id}
                className="border-t border-white/10 hover:bg-white/[0.06]"
              >
                <td className="p-3 text-sm">
                  {`${b.clientFirstName ?? ''} ${b.clientLastName ?? ''}`.trim() ||
                    'Guest'}
                </td>
                <td className="p-3 font-mono text-sm">{b.clientPhone}</td>
                <td className="p-3 text-sm">{b.serviceName}</td>
                <td className="p-3 text-sm">{b.providerName}</td>
                <td className="p-3 text-sm">
                  {(() => {
                    const d = new Date(b.appointment.startsAt);
                    return `${spaDate.format(d)} • ${spaTime.format(d)} ET`;
                  })()}
                </td>
                <td className="p-3 text-sm">
                  {b.appointment.estimatedValue != null
                    ? `$${b.appointment.estimatedValue.toLocaleString()}`
                    : '—'}
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-aura-ink/50">
                  No bookings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {bookings.map((b) => {
          const name =
            `${b.clientFirstName ?? ''} ${b.clientLastName ?? ''}`.trim() || 'Guest';
          const d = new Date(b.appointment.startsAt);
          const when = spaDate.format(d);
          const time = `${spaTime.format(d)} ET`;
          return (
            <div key={b.appointment.id} className="glass-strong p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-aura-ink">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-aura-pink">
                    <UserIcon size={14} />
                  </span>
                  <div>
                    <div className="font-medium leading-tight">{name}</div>
                    <div className="font-mono text-[11px] text-aura-ink/60">
                      {b.clientPhone}
                    </div>
                  </div>
                </div>
                {b.appointment.estimatedValue != null && (
                  <span className="chip bg-aura-pink/20 text-aura-pink ring-1 ring-aura-pink/40">
                    ${b.appointment.estimatedValue.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="space-y-1 text-sm text-aura-ink/85">
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="opacity-60" />
                  <span>
                    {b.serviceName}
                    <span className="text-aura-ink/50"> · {b.providerName}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays size={12} className="opacity-60" />
                  <span>{when}</span>
                  <Clock size={12} className="ml-1 opacity-60" />
                  <span>{time}</span>
                </div>
              </div>
            </div>
          );
        })}
        {bookings.length === 0 && (
          <div className="glass-strong p-8 text-center text-aura-ink/50">
            No bookings yet.
          </div>
        )}
      </div>
    </div>
  );
}
