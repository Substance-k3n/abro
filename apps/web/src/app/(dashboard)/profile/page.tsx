'use client';

// PRF-01 User Profile -- docs/ABRO_FRONTEND_SPEC.md §7. Roadmap Phase 4b
// turned it from an always-editable form into an account hub, the way a
// banking app's profile reads: your photo, name, @username and verified
// email at the top with an "Edit profile" button (fields moved to
// /profile/edit), this year's numbers, then a short menu, then Sign out.
// Reached from Home's avatar on phones and the sidebar on desktop.
//
// Statistics are real: friends and groups from their lists, and this
// year's spending / what you paid from GET /analytics/yearly (settlements
// excluded, per apps/api).

import { Avatar } from '@abro/ui';
import { ETB, formatMoney } from '@abro/types';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  LogOut,
  type LucideIcon,
  Palette,
  Pencil,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError, api } from '~/lib/api-client';
import { type AuthProfile, logout, me } from '~/lib/auth-api';
import { listFriends } from '~/lib/friends-api';
import { listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { photoSrc } from '~/lib/photos';
import { useApiRefresh } from '~/lib/use-api-refresh';

interface Stats {
  friends: number;
  groups: number;
  spentThisYear: bigint;
  paidThisYear: bigint;
}

async function loadStats(): Promise<Stats> {
  const year = new Date().getFullYear();
  const [friends, groups, yearly] = await Promise.all([
    listFriends(),
    listGroups(),
    api.get<{ yearlyTotal: string; personalContribution: string }>(
      `/analytics/yearly?year=${year}`,
    ),
  ]);
  return {
    friends: friends.length,
    groups: groups.length,
    spentThisYear: BigInt(yearly.yearlyTotal),
    paidThisYear: BigInt(yearly.personalContribution),
  };
}

const MENU: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Edit profile', href: '/profile/edit', icon: Pencil },
  { label: 'Notifications', href: '/settings/notifications', icon: Bell },
  { label: 'Appearance & app settings', href: '/settings', icon: Palette },
  { label: 'Privacy & security', href: '/settings/privacy', icon: Shield },
  { label: 'Guide & how to install', href: '/guide', icon: BookOpen },
];

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([me(), loadStats()])
      .then(([p, s]) => {
        setProfile(p);
        setStats(s);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
      });
  };

  useEffect(load, []);

  useApiRefresh(load);

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      router.replace('/auth/signin');
    } catch (err) {
      setSignOutError(
        err instanceof ApiError ? err.message : 'Could not sign out. Please try again.',
      );
      setSigningOut(false);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!profile || !stats) {
    return <LoadingState />;
  }

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h2
        className="font-display text-[1.5rem] font-extrabold tracking-tighter"
        style={{ color: 'var(--t-primary)' }}
      >
        Profile
      </h2>

      {/* Identity */}
      <section className="neo-raised flex flex-col items-center gap-3 rounded-[26px] px-5 pb-5 pt-6 text-center">
        <Avatar
          initials={initialsOf(profile.displayName)}
          color={colorForId(profile.id)}
          size={88}
          src={photoSrc(profile.avatarUrl)}
          alt={profile.displayName}
        />
        <div className="flex flex-col gap-0.5">
          <p
            className="font-display text-[1.35rem] font-bold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {profile.displayName}
          </p>
          {profile.username && (
            <p className="font-mono text-[0.85rem]" style={{ color: 'var(--t-dim)' }}>
              @{profile.username}
            </p>
          )}
        </div>
        {profile.email && (
          <p
            className="flex items-center gap-1.5 text-[0.8rem]"
            style={{ color: 'var(--t-secondary)' }}
          >
            {profile.email}
            <CheckCircle2
              size={14}
              strokeWidth={2}
              style={{ color: 'var(--c-green)' }}
              aria-label="Verified"
            />
          </p>
        )}
        <Link
          href="/profile/edit"
          className="neo-btn font-display mt-1 flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-[0.85rem] font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          <Pencil size={15} strokeWidth={2} /> Edit profile
        </Link>
      </section>

      {/* This year */}
      <section className="grid grid-cols-2 gap-2.5">
        <StatCard label="Friends" value={String(stats.friends)} />
        <StatCard label="Groups" value={String(stats.groups)} />
        <StatCard
          label={`Shared spending in ${new Date().getFullYear()}`}
          value={formatMoney(stats.spentThisYear, ETB)}
        />
        <StatCard label="You paid this year" value={formatMoney(stats.paidThisYear, ETB)} />
      </section>

      {/* Menu */}
      <nav className="neo-raised-sm flex flex-col rounded-3xl p-2" aria-label="Profile">
        {MENU.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[0.9rem] font-medium"
              style={{ color: 'var(--t-secondary)' }}
            >
              <span
                className="neo-inset-sm flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ color: 'var(--accent)' }}
                aria-hidden
              >
                <Icon size={17} strokeWidth={2} />
              </span>
              <span className="flex-1">{item.label}</span>
              <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
            </Link>
          );
        })}
      </nav>

      {signOutError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {signOutError}
        </p>
      )}
      <button
        onClick={signOut}
        disabled={signingOut}
        className="neo-btn flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.9rem] font-semibold disabled:opacity-50"
        style={{ color: 'var(--c-red)' }}
      >
        <LogOut size={17} strokeWidth={2} /> {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="neo-raised-sm rounded-2xl px-3.5 py-3">
      <p
        className="font-display mb-1 text-[1.1rem] font-extrabold tracking-tight"
        style={{ color: 'var(--t-primary)' }}
      >
        {value}
      </p>
      <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
        {label}
      </p>
    </div>
  );
}
