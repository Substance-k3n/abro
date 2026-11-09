'use client';

// The portal frame: a fixed dark sidebar (brand, sections, sign out) and
// a top bar (today in Addis Ababa, who's signed in and their role). Only
// sections the signed-in role may open are listed.

import { Logomark } from '@abro/ui';
import {
  Boxes,
  LayoutDashboard,
  Lock,
  LogOut,
  type LucideIcon,
  Menu,
  Mic,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { type Permission, signOut } from '~/lib/admin-api';
import { ROLE_LABEL, useSession } from '~/lib/session';

import { SessionGuard } from './SessionGuard';
import { Avatar } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  need: Permission;
}

// Sections are added here as their pages land (ADR-028's PR plan). Split
// into two groups for the sidebar: day-to-day workspace vs. governance --
// a real distinction (who can see what vs. what's happening), not just
// visual decoration.
const WORKSPACE_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, need: 'overview.view' },
  { href: '/users', label: 'Users', icon: Users, need: 'users.view' },
  { href: '/groups', label: 'Groups', icon: Boxes, need: 'groups.view' },
  { href: '/voice', label: 'Voice', icon: Mic, need: 'overview.view' },
];
const GOVERNANCE_NAV: NavItem[] = [
  { href: '/roles', label: 'Roles & Permissions', icon: ShieldCheck, need: 'admins.view' },
  { href: '/audit', label: 'Audit log', icon: ScrollText, need: 'audit.view' },
  { href: '/security', label: 'Security', icon: Lock, need: 'overview.view' },
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
  const [navOpen, setNavOpen] = useState(false);

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // A new page is a nav choice having landed -- close the mobile drawer.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`bg-side text-side-ink fixed inset-y-0 left-0 z-30 flex w-60 flex-col transition-transform md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-side-2 flex items-center gap-2.5 border-b px-6 py-6">
          <Logomark size={26} />
          <div>
            <div className="font-display text-xl font-semibold tracking-tight text-white">abro</div>
            <div className="text-side-muted mt-0.5 text-xs">Admin Portal</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Sections">
          <p className="text-side-muted px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide">
            Workspace
          </p>
          {WORKSPACE_NAV.filter((n) => session.can(n.need)).map((n) => (
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
          {GOVERNANCE_NAV.some((n) => session.can(n.need)) && (
            <p className="text-side-muted px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wide">
              Governance
            </p>
          )}
          {GOVERNANCE_NAV.filter((n) => session.can(n.need)).map((n) => (
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

      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        <header className="border-line sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className="text-ink-2 hover:bg-page -ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg md:hidden"
              onClick={() => setNavOpen(true)}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <div className="text-ink-2 hidden truncate text-sm sm:block">{today()}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{session.profile.displayName}</div>
              <div className="text-ink-3 text-[11px] font-medium uppercase tracking-wide">
                {ROLE_LABEL[session.role]}
                {session.owner ? ' · owner' : ''}
              </div>
            </div>
            <Avatar name={session.profile.displayName} url={session.profile.avatarUrl} size={36} />
          </div>
        </header>
        <SessionGuard />
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
