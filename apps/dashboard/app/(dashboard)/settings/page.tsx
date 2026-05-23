// apps/dashboard/app/(dashboard)/settings/page.tsx
// MVP: read-only. The guide (§1.2) defers per-spa config / multi-tenancy to v2,
// and exposes no settings write API, so this mirrors the seeded demo spa
// (packages/db/seed.ts) as a static reference card. v1.5 adds editable config.

const spa = {
  name: 'Aura Med Spa',
  address: '142 Greene Street, New York, NY 10012',
  timezone: 'America/New_York',
  hours: [
    ['Monday', '9:00 AM – 7:00 PM'],
    ['Tuesday', '9:00 AM – 7:00 PM'],
    ['Wednesday', '9:00 AM – 7:00 PM'],
    ['Thursday', '9:00 AM – 8:00 PM'],
    ['Friday', '9:00 AM – 8:00 PM'],
    ['Saturday', '10:00 AM – 6:00 PM'],
    ['Sunday', 'Closed'],
  ],
  voice: 'ElevenLabs · eleven_turbo_v2_5 ("Maya")',
  model: 'Claude Sonnet 4.5 (via Vapi)',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-strong p-5 md:p-6">
      <h2 className="mb-4 font-medium text-aura-ink">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-y-1 text-sm">
      <div className="text-aura-ink/60">{label}</div>
      <div className="col-span-2 text-aura-ink">{value}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5 md:space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold text-white drop-shadow-sm">
          Settings
        </h1>
        <p className="text-sm text-white/75">
          Read-only in the MVP &mdash; per-spa editing ships in v1.5.
        </p>
      </header>

      <Card title="Spa">
        <div className="space-y-3">
          <Row label="Name" value={spa.name} />
          <Row label="Address" value={spa.address} />
          <Row label="Timezone" value={spa.timezone} />
        </div>
      </Card>

      <Card title="Hours">
        <div className="space-y-2">
          {spa.hours.map(([day, h]) => (
            <Row key={day} label={day} value={h} />
          ))}
        </div>
      </Card>

      <Card title="Voice & model">
        <div className="space-y-3">
          <Row label="Voice" value={spa.voice} />
          <Row label="Model" value={spa.model} />
        </div>
      </Card>
    </div>
  );
}
