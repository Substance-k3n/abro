'use client';

// The portal frame: a fixed dark sidebar (brand, sections, sign out) and
// a top bar (today in Addis Ababa, who's signed in and their role). Only
// sections the signed-in role may open are listed.

import {
  Boxes,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Mic,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { type Permission, signOut } from '~/lib/admin-api';
import { ROLE_LABEL, useSession } from '~/lib/session';

import { Avatar } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  need: Permission;
}

// Sections are added here as their pages land (ADR-028's PR plan).
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, need: 'overview.view' },
  { href: '/users', label: 'Users', icon: Users, need: 'users.view' },
  { href: '/groups', label: 'Groups', icon: Boxes, need: 'groups.view' },
  { href: '/voice', label: 'Voice', icon: Mic, need: 'overview.view' },
  { href: '/roles', label: 'Roles & Permissions', icon: ShieldCheck, need: 'admins.view' },
];

const today = () =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Addis_Ababa',
  }).format(new Date());

export function Shell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen">
      <aside className="bg-side text-side-ink fixed inset-y-0 left-0 z-20 flex w-60 flex-col">
        <div className="border-side-2 border-b px-6 py-6">
          <div className="font-display text-2xl font-semibold tracking-tight text-white">ABRO</div>
          <div className="text-side-muted mt-0.5 text-xs">Admin Portal</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Sections">
          {NAV.filter((n) => session.can(n.need)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active(n.href)
                  ? 'bg-accent text-white'
                  : 'text-side-ink hover:bg-side-2 hover:text-white'
              }`}
            >
              <n.icon className="size-4.5 shrink-0" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-side-2 border-t px-3 py-4">
          <button
            type="button"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              await signOut().catch(() => {});
              router.replace('/signin');
            }}
            className="text-side-ink hover:bg-side-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:text-white disabled:opacity-60"
          >
            <LogOut className="size-4.5" aria-hidden />
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="ml-60 flex min-w-0 flex-1 flex-col">
        <header className="border-line sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white/90 px-8 backdrop-blur">
          <div className="text-ink-2 text-sm">{today()}</div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold">{session.profile.displayName}</div>
              <div className="text-ink-3 text-[11px] font-medium uppercase tracking-wide">
                {ROLE_LABEL[session.role]}
                {session.owner ? ' · owner' : ''}
              </div>
            </div>
            <Avatar name={session.profile.displayName} url={session.profile.avatarUrl} size={36} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
