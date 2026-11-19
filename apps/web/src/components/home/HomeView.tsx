'use client';

// Home, as a pure view: everything it shows arrives as props, so the page
// (app/(dashboard)/home/page.tsx) owns fetching and this can be rendered
// with sample data to review the design without an API.
//
// Layout follows the Stitch "Terracotta Kin" redesign (2026-11-19): a top
// bar, greeting + search, the balance hero with its actions, friends,
// the ekub in progress, groups as small cards, recent activity, and an
// invite card. Terracotta is kept for the hero, the one primary action and
// links; chips and tiles stay neutral, and green/red mean money only.

import { Avatar, EmptyState, Logomark } from '@abro/ui';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Handshake,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { MinorUnits } from '@abro/types';

import { ActivityRow } from '~/components/ActivityRow';
import { GroupPicture } from '~/components/GroupPicture';
import { InstallApp } from '~/components/InstallApp';
import { PushNotifications } from '~/components/PushNotifications';
import {
  Amount,
  HeroBalance,
  Panel,
  Row,
  SectionHeader,
  Tile,
  digits,
  greeting,
} from '~/components/refresh';
import type { FriendRow, GroupRow } from '~/lib/balances-api';
import type { ActivityDisplay } from '~/lib/expenses-api';
import type { GroupType } from '~/lib/groups-api';

export interface HomeEkub {
  id: string;
  name: string;
  memberCount: number;
  /** "500.00 ETB monthly" -- what each turn puts in, and how often. */
  contribution: string;
  currentRound: number;
  totalRounds: number;
  /** "Mon 2 Mar", or null before a date is set. */
  nextDue: string | null;
  /** Who takes the pot this round. */
  recipient: string | null;
  members: { id: string; initials: string; color: string; photo: string | null }[];
  /** Still to put in this round, formatted ("500.00 ETB"), or null. */
  toPay: string | null;
}

export type HomeGroup = GroupRow & { groupType: GroupType & { tint: string } };

export interface HomeViewProps {
  profile: { id: string; firstName: string; initials: string; color: string; photo: string | null };
  unreadCount: number;
  net: MinorUnits;
  owedTotal: MinorUnits;
  oweTotal: MinorUnits;
  friends: FriendRow[];
  ekub: HomeEkub | null;
  groups: HomeGroup[];
  activity: { id: string; display: ActivityDisplay }[];
  /** Payments others say they made to you, waiting for you to confirm. */
  toConfirm: { count: number; total: MinorUnits; firstName: string } | null;
}

export function HomeView(p: HomeViewProps) {
  const router = useRouter();
  const shownGroups = [...p.groups]
    .sort((a, b) => (b.balance !== 0n ? 1 : 0) - (a.balance !== 0n ? 1 : 0))
    .slice(0, 4);

  return (
    <div className="hide-scroll">
      <TopBar profile={p.profile} unreadCount={p.unreadCount} />

      <div className="px-5 pb-8 pt-5 md:mx-auto md:max-w-6xl md:px-8">
        <Greeting firstName={p.profile.firstName} />

        <InstallApp variant="banner" />
        <PushNotifications variant="banner" />

        {p.toConfirm && (
          <Panel className="mb-4">
            <Row
              href="/payments"
              leading={
                <Tile tint="var(--accent-light)" color="var(--accent)">
                  <Wallet size={19} strokeWidth={2} />
                </Tile>
              }
              title={
                p.toConfirm.count === 1
                  ? `${p.toConfirm.firstName} says they paid you`
                  : `${p.toConfirm.count} payments to confirm`
              }
              sub="Confirm once the money has reached you"
              trailing={<Amount value={p.toConfirm.total} tone="owed" />}
              chevron
            />
          </Panel>
        )}

        <div className="md:grid md:grid-cols-[1.25fr_1fr] md:items-start md:gap-7">
          <div>
            <HeroBalance
              net={p.net}
              owedTotal={p.owedTotal}
              oweTotal={p.oweTotal}
              onOwed={() => router.push('/balances/owed')}
              onOwe={() => router.push('/balances/owe')}
            >
              <Link
                href="/settle"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 text-[0.88rem] font-semibold transition-transform active:scale-[0.98]"
                style={{ color: '#9c3209' }}
              >
                <Handshake size={18} strokeWidth={2} aria-hidden />
                Settle up
              </Link>
              <Link
                href="/expenses/new?type=iou"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/[0.16] px-3 py-2.5 text-[0.88rem] font-semibold text-white transition-colors active:bg-white/25"
              >
                <Receipt size={18} strokeWidth={2} aria-hidden />
                IOU
              </Link>
              <Link
                href="/groups/new"
                aria-label="New group"
                className="flex w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.16] text-white transition-colors active:bg-white/25"
              >
                <Users size={18} strokeWidth={2} aria-hidden />
              </Link>
            </HeroBalance>

            <div className="mt-7">
              <FriendsStrip friends={p.friends} />
            </div>

            {p.ekub && (
              <div className="mt-7">
                <EkubCard ekub={p.ekub} />
              </div>
            )}

            <div className="mt-7 hidden md:block">
              <RecentActivity rows={p.activity} />
            </div>
          </div>

          <div className="mt-7 md:mt-0">
            <section className="mb-7">
              <SectionHeader title="Groups" href="/groups" link="See all" />
              {shownGroups.length === 0 ? (
                <Panel>
                  <Row
                    href="/groups/new"
                    leading={
                      <Tile tint="var(--accent-light)" color="var(--accent)">
                        <Users size={19} strokeWidth={1.9} />
                      </Tile>
                    }
                    title="Start a shared tab"
                    sub="For a trip, a household, an ekub -- anything with recurring costs"
                    chevron
                  />
                </Panel>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {shownGroups.map((g) => (
                    <GroupCard key={g.id} g={g} />
                  ))}
                </div>
              )}
            </section>

            <InviteCard />
          </div>
        </div>

        <div className="mt-7 md:hidden">
          <RecentActivity rows={p.activity} />
        </div>
      </div>
    </div>
  );
}

function TopBar({
  profile,
  unreadCount,
}: {
  profile: HomeViewProps['profile'];
  unreadCount: number;
}) {
  return (
    <div
      className="px-5 py-3.5 md:px-8"
      style={{ borderBottom: '1px solid var(--border-sub)', background: 'var(--neo-bg2)' }}
    >
      <div className="flex items-center justify-between md:mx-auto md:max-w-6xl">
        <div className="flex items-center gap-2.5">
          <Logomark size={34} />
          <span
            className="font-display text-[1.25rem] font-semibold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            Home
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            className="neo-btn relative flex h-11 w-11 items-center justify-center rounded-full"
          >
            <Bell size={20} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.62rem] font-bold text-white"
                style={{ background: 'var(--owe)' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          <Link href="/profile" aria-label="Your profile">
            <Avatar
              initials={profile.initials}
              color={profile.color}
              size={44}
              src={profile.photo}
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Greeting({ firstName }: { firstName: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p
          className="text-[0.72rem] font-semibold uppercase tracking-[0.08em]"
          style={{ color: 'var(--accent)' }}
        >
          {greeting()}
        </p>
        <h1
          className="font-display mt-0.5 truncate text-[1.55rem] font-semibold leading-tight tracking-tight"
          style={{ color: 'var(--t-primary)' }}
        >
          Welcome back, {firstName}
        </h1>
      </div>
      <Link
        href="/search"
        aria-label="Search"
        className="neo-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      >
        <Search size={19} strokeWidth={1.9} />
      </Link>
    </div>
  );
}

function FriendsStrip({ friends }: { friends: FriendRow[] }) {
  const shown = friends.slice(0, 12);
  return (
    <section>
      <SectionHeader
        title={`Friends${friends.length ? ` (${friends.length})` : ''}`}
        href="/friends"
        link="View all"
      />
      <div className="hide-scroll -mx-5 flex gap-4 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
        <Link href="/friends/add" className="flex w-[64px] shrink-0 flex-col items-center gap-1.5">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            <UserPlus size={22} strokeWidth={1.9} />
          </span>
          <span className="text-[0.76rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
            Add
          </span>
        </Link>
        {shown.map((f) => {
          const owed = f.owes > 0n;
          const owe = f.iOwe > 0n;
          return (
            <Link
              key={f.id}
              href={`/friends/${f.id}`}
              className="flex w-[64px] shrink-0 flex-col items-center gap-1"
            >
              <Avatar initials={f.initials} color={f.color} size={56} src={f.photo} />
              <span
                className="w-full truncate text-center text-[0.76rem] font-medium"
                style={{ color: 'var(--t-primary)' }}
              >
                {f.name.split(' ')[0]}
              </span>
              <span
                className="figure text-[0.7rem] font-semibold"
                style={{
                  color: owed ? 'var(--owed)' : owe ? 'var(--owe)' : 'var(--t-dim)',
                }}
              >
                {owed ? `+${digits(f.owes)}` : owe ? `-${digits(f.iOwe)}` : 'Settled'}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function EkubCard({ ekub }: { ekub: HomeEkub }) {
  const pct = ekub.totalRounds > 0 ? Math.round((ekub.currentRound / ekub.totalRounds) * 100) : 0;
  const extra = ekub.memberCount - ekub.members.length;
  return (
    <section>
      <SectionHeader title="Ekub" href="/ekub" />
      <Link href={`/ekub/${ekub.id}`} className="neo-raised block rounded-[22px] p-4">
        <div className="flex items-start gap-3">
          <Tile tint="var(--accent-light)" color="var(--accent)" size={44}>
            <PiggyBank size={21} strokeWidth={1.9} />
          </Tile>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[0.98rem] font-semibold"
              style={{ color: 'var(--t-primary)' }}
            >
              {ekub.name}
            </p>
            <p className="mt-0.5 truncate text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
              {ekub.memberCount} members &middot; {ekub.contribution}
            </p>
          </div>
        </div>

        <div className="mt-3.5 rounded-2xl p-3" style={{ background: 'var(--neo-bg)' }}>
          <div className="flex items-baseline justify-between text-[0.8rem]">
            <span className="font-semibold" style={{ color: 'var(--t-primary)' }}>
              Round {ekub.currentRound} of {ekub.totalRounds}
            </span>
            <span style={{ color: 'var(--t-muted)' }}>{pct}% done</span>
          </div>
          <div
            className="mt-2 flex gap-1"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={ekub.totalRounds}
            aria-valuenow={ekub.currentRound}
            aria-label="Ekub progress"
          >
            {Array.from({ length: ekub.totalRounds }, (_, i) => (
              <span
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: i < ekub.currentRound ? 'var(--accent)' : 'var(--border-med)',
                }}
              />
            ))}
          </div>
          <div
            className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.76rem]"
            style={{ color: 'var(--t-muted)' }}
          >
            {ekub.nextDue && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={14} strokeWidth={1.9} aria-hidden />
                Due {ekub.nextDue}
              </span>
            )}
            {ekub.recipient && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={14} strokeWidth={1.9} aria-hidden />
                Takes the pot: {ekub.recipient}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between">
          <div className="flex items-center">
            {ekub.members.map((m, i) => (
              <span
                key={m.id}
                className={`rounded-[11px] ${i === 0 ? '' : '-ml-2'}`}
                style={{ boxShadow: '0 0 0 2px var(--neo-bg2)' }}
              >
                <Avatar initials={m.initials} color={m.color} size={30} src={m.photo} />
              </span>
            ))}
            {extra > 0 && (
              <span
                className="-ml-2 flex h-[30px] min-w-[30px] items-center justify-center rounded-full px-1 text-[0.7rem] font-semibold"
                style={{ background: 'var(--neo-bg)', color: 'var(--t-muted)' }}
              >
                +{extra}
              </span>
            )}
          </div>
          <span
            className="rounded-xl px-3.5 py-2 text-[0.82rem] font-semibold"
            style={
              ekub.toPay
                ? { background: '#c2410c', color: '#fff' }
                : { background: 'var(--neo-bg)', color: 'var(--t-primary)' }
            }
          >
            {ekub.toPay ? `Pay ${ekub.toPay}` : 'Open'}
          </span>
        </div>
      </Link>
    </section>
  );
}

function GroupCard({ g }: { g: HomeGroup }) {
  const owed = g.balance > 0n;
  const owe = g.balance < 0n;
  return (
    <Link href={`/groups/${g.id}`} className="neo-raised flex flex-col rounded-[20px] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Tile tint={g.groupType.tint} color={g.groupType.color} size={38}>
          <GroupPicture photo={g.photo} icon={g.groupType.icon} size={18} />
        </Tile>
        <span
          className="rounded-full px-2 py-0.5 text-[0.66rem] font-semibold"
          style={
            owed
              ? { background: 'var(--owed-soft)', color: 'var(--owed)' }
              : owe
                ? { background: 'var(--owe-soft)', color: 'var(--owe)' }
                : { background: 'var(--neo-bg)', color: 'var(--t-muted)' }
          }
        >
          {owed ? 'Owed' : owe ? 'You owe' : 'Settled'}
        </span>
      </div>
      <p
        className="mt-2.5 truncate text-[0.92rem] font-semibold"
        style={{ color: 'var(--t-primary)' }}
      >
        {g.name}
      </p>
      <div className="mt-2.5 rounded-xl px-2.5 py-2" style={{ background: 'var(--neo-bg)' }}>
        <p
          className="text-[0.64rem] font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          {owed ? 'You get back' : owe ? 'You pay' : 'All square'}
        </p>
        <div className="mt-0.5">
          {g.balance === 0n ? (
            <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-muted)' }}>
              Nothing owed
            </span>
          ) : (
            <Amount value={g.balance} tone={owed ? 'owed' : 'owe'} />
          )}
        </div>
      </div>
    </Link>
  );
}

function RecentActivity({ rows }: { rows: HomeViewProps['activity'] }) {
  const router = useRouter();
  return (
    <section>
      <SectionHeader title="Recent activity" href="/activity" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="No activity yet"
          description="Expenses and payments will show up here."
        />
      ) : (
        <Panel>
          {rows.map((r) => (
            <ActivityRow
              key={r.id}
              a={r.display}
              onClick={() => router.push(`/expenses/${r.id}`)}
            />
          ))}
        </Panel>
      )}
    </section>
  );
}

function InviteCard() {
  return (
    <Panel>
      <div className="flex items-center gap-3 p-4">
        <Tile tint="var(--accent-light)" color="var(--accent)" size={44}>
          <Plus size={21} strokeWidth={2} />
        </Tile>
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            Shared finances, zero stress
          </p>
          <p className="mt-0.5 text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
            Invite friends to your next group or ekub.
          </p>
        </div>
        <Link
          href="/friends/add"
          className="neo-btn-accent shrink-0 rounded-xl px-4 py-2.5 text-[0.82rem] font-semibold"
        >
          Invite
        </Link>
      </div>
    </Panel>
  );
}
