import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

// ─────────────────────────────────────────────────────────────────────────────
// AUTH SEAM (deviation from guide §3.2): the MVP is a single shared demo spa
// with no auth-bearing data, so Clerk is intentionally omitted. To add auth
// later: wrap this layout's return in Clerk's <SignedIn>, add middleware.ts
// with clerkMiddleware(), and an app/(auth)/sign-in route. Nothing else here
// needs to change. See docs/PROGRESS.md.
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
