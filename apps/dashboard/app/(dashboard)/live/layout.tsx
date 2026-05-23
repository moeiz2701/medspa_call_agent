'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, PhoneCall } from 'lucide-react';

const tabs = [
  { href: '/live/browser', label: 'Browser', icon: Globe },
  { href: '/live/phone', label: 'Phone', icon: PhoneCall },
];

export default function LiveLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] md:min-h-screen flex-col">
      <div className="px-4 pt-4 md:px-8 md:pt-6">
        <div className="glass-strong inline-flex p-1 text-sm">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
                  active
                    ? 'bg-gradient-to-br from-aura-rose to-aura-magenta text-white shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
