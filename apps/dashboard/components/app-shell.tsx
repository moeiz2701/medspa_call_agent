'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Radio,
  Phone,
  Calendar,
  Settings,
  Menu,
  X,
  User,
} from 'lucide-react';

const nav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/live', label: 'Live', icon: Radio },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/bookings', label: 'Bookings', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open so the underlay doesn't scroll.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen text-aura-ink">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col border-r border-white/10 bg-aura-night/40 backdrop-blur-xl">
        <div className="px-6 py-7">
          <div className="text-lg font-semibold text-white drop-shadow-sm">Aura Med Spa</div>
          <div className="text-xs text-aura-pink/80">AI Receptionist</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-aura-pink/15 text-white ring-1 ring-aura-pink/40 shadow-glass'
                    : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4">
          <div className="glass-strong flex items-center gap-3 px-3 py-2.5 text-sm text-white">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-aura-pink/20 ring-1 ring-aura-pink/40 text-aura-pink">
              <User size={16} />
            </div>
            <div className="leading-tight">
              <div className="font-medium">Front desk</div>
              <div className="text-xs text-white/60">Demo workspace</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/10 bg-aura-night/60 backdrop-blur-xl px-4 py-3">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15"
        >
          <Menu size={20} />
        </button>
        <div className="text-center text-white">
          <div className="text-sm font-semibold leading-tight">Aura Med Spa</div>
          <div className="text-[10px] uppercase tracking-wider text-aura-pink/80">
            AI Receptionist
          </div>
        </div>
        <button
          aria-label="Profile"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15"
        >
          <User size={18} />
        </button>
      </header>

      {/* Mobile drawer + scrim */}
      {mobileOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[80%] transform border-r border-white/10 bg-gradient-to-b from-aura-purple via-aura-mauve to-aura-indigo p-5 shadow-glass transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="text-white">
            <div className="text-lg font-semibold">Aura Med Spa</div>
            <div className="text-xs text-aura-pink/80">AI Receptionist</div>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                  active
                    ? 'bg-aura-pink/15 text-white ring-1 ring-aura-pink/40 shadow-glass'
                    : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-x-hidden pt-16 md:pt-0">
        {children}
      </main>
    </div>
  );
}
