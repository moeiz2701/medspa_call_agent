import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aura Med Spa — AI Receptionist',
  description: 'Live calls, bookings, and ROI for your AI front desk.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
