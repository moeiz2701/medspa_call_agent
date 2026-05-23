'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '@/lib/api';
import { Phone, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

export default function Home() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  });
  if (!stats) {
    return (
      <div className="p-8 text-white/80">Loading…</div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-6xl mx-auto">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold text-white drop-shadow-sm">
          Aura Med Spa
        </h1>
        <p className="text-sm text-white/75">Last 30 days</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Phone size={18} />}
          label="Calls answered"
          value={stats.callsAnswered}
        />
        <StatCard
          icon={<Calendar size={18} />}
          label="Bookings made"
          value={stats.bookingsMade}
        />
        <StatCard
          icon={<DollarSign size={18} />}
          label="Revenue captured"
          value={`$${stats.revenueCaptured.toLocaleString()}`}
          accent
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Conversion"
          value={`${stats.conversionRate}%`}
        />
      </div>

      <div className="glass-strong p-5 md:p-6">
        <h2 className="text-lg md:text-xl font-medium text-aura-ink mb-2">
          ROI summary
        </h2>
        <p className="text-sm md:text-base text-aura-ink/85">
          Your AI receptionist booked{' '}
          <strong>{stats.bookingsMade}</strong> appointments worth{' '}
          <strong>${stats.revenueCaptured.toLocaleString()}</strong> in estimated
          revenue over the last 30 days.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`glass-strong p-5 ${
        accent ? 'ring-1 ring-aura-pink/60' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-aura-ink/70 mb-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-aura-pink">
          {icon}
        </span>
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl md:text-3xl font-semibold text-aura-ink">
        {value}
      </div>
    </div>
  );
}
