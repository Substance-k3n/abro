'use client';

// GRP-03 Group Detail View -- docs/ABRO_FRONTEND_SPEC.md §5 (lines
// 1198-1263). Ported from the prototype's GroupDetailScreen (App.tsx:
// 2335-2468) -- info card, balance card, Expenses/Balances/Members
// tabs. The prototype hardcodes `GROUPS[0]` and scopes both tabs to
// ALL of FRIENDS regardless of actual membership; this port scopes
// correctly to the real group via its own `memberIds`/`id`.
//
// Deviations:
//  - "Settings icon (if admin)" / "More menu": since there's no real
//    membership/role system (see Members tab note below), and no
//    settings/more-menu content exists to gate yet (GRP-07 lands in a
//    later PR), the settings icon just always links to
//    `/groups/[id]/settings`; the separate "More menu" is dropped
//    (nothing to put in it beyond what settings already covers).
//  - Quick Actions render as a row of buttons, not literal floating
//    action buttons -- same simplification Home's Quick Actions grid
//    already established for this app.
//  - Expenses tab uses EXPENSES (Phase 4's full expense records,
//    filtered by `groupId`) rather than ACTIVITIES -- more accurate,
//    since EXPENSES carries a real `groupId` field and ACTIVITIES only
//    has a free-text `sub` string.
//  - Balances tab: "you" (role: creator) is always shown as Admin,
//    everyone else as Member -- there's no real per-member role data
//    anywhere in this app's mock model, and every existing/creatable
//    group in this app is implicitly "yours". A real membership system
//    is out of scope for a mock-data phase.

import { ETB, formatMoney } from '@abro/types';
import { ActivityItem, Avatar, EmptyState, GroupIcon } from '@abro/ui';
import {
  ArrowLeft,
  Handshake,
  Plus,
  Receipt,
  Settings,
  Split,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import { EXPENSES, GROUPS, GROUP_BALANCES, resolveParticipants } from '~/lib/mock-data';

type Tab = 'expenses' | 'balances' | 'members';

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('expenses');

  const group = GROUPS.find((g) => g.id === params.id);

  if (!group) {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <button
          onClick={() => router.push('/groups')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Groups
        </button>
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="Group not found"
          description="This group doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  const groupExpenses = EXPENSES.filter((e) => e.groupId === group.id);
  const balances = GROUP_BALANCES[group.id] ?? {};
  const memberRows = resolveParticipants(['me', ...group.memberIds]);

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push('/groups')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Groups
        </button>
        <h2
          className="font-display flex-1 truncate px-3 text-center text-[1rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          {group.name}
        </h2>
        <Link
          href={`/groups/${group.id}/settings`}
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <Settings size={17} strokeWidth={2} />
        </Link>
      </div>

      {/* Group info card */}
      <div className="neo-raised-lg mb-4 rounded-3xl p-5">
        <div className="mb-4 flex items-center gap-3.5">
          <div
            className="neo-raised-sm flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ color: group.color }}
          >
            <GroupIcon icon={group.icon} size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="rounded-lg px-2 py-0.5 text-[0.72rem] font-semibold"
                style={{ background: `${group.color}22`, color: group.color }}
              >
                {group.type}
              </span>
            </div>
            <p className="text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
              {group.members} members · Created {group.createdAt}
            </p>
          </div>
        </div>

        <div className="neo-inset-sm flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="mb-0.5 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
              Your balance in this group
            </p>
            <p
              className="font-display text-[1.3rem] font-extrabold tracking-tight"
              style={{ color: group.balance < 0n ? 'var(--c-red)' : 'var(--c-green)' }}
            >
              {group.balance < 0n ? '-' : group.balance > 0n ? '+' : ''}
              {formatMoney(group.balance < 0n ? -group.balance : group.balance, ETB)}
            </p>
          </div>
          {group.balance !== 0n && (
            <Link
              href={`/settle?groupId=${group.id}`}
              className="neo-btn-green font-display rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold"
            >
              Settle Up
            </Link>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <Link
          href={`/expenses/new?groupId=${group.id}`}
          className="neo-btn-accent flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
        >
          <Plus size={18} strokeWidth={2} />
          <span className="text-[0.68rem] font-medium">Add Expense</span>
        </Link>
        <Link
          href={`/settle?groupId=${group.id}`}
          className="neo-btn flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
          style={{ color: 'var(--t-secondary)' }}
        >
          <Handshake size={18} strokeWidth={2} />
          <span className="text-[0.68rem] font-medium">Settle Up</span>
        </Link>
        <Link
          href={`/groups/${group.id}/simplified`}
          className="neo-btn flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
          style={{ color: 'var(--t-secondary)' }}
        >
          <Split size={18} strokeWidth={2} />
          <span className="text-[0.68rem] font-medium">Simplify</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="neo-inset-sm mb-4 flex gap-1 rounded-2xl p-1">
        {(['expenses', 'balances', 'members'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`neo-tab flex-1 rounded-xl border-none py-2 text-[0.82rem] font-medium capitalize ${
              tab === t ? 'active' : ''
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'expenses' &&
        (groupExpenses.length === 0 ? (
          <EmptyState
            icon={<Receipt size={26} strokeWidth={1.5} />}
            title="No expenses yet"
            description="Add the first expense for this group."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {groupExpenses.map((e) => (
              <ActivityItem
                key={e.id}
                category={e.category}
                title={e.name}
                sub={e.date}
                amount={e.amount}
                dir={e.payerId === ME ? 'receive' : 'owe'}
                time={e.createdAt}
                onClick={() => router.push(`/expenses/${e.id}`)}
              />
            ))}
          </div>
        ))}

      {tab === 'balances' && (
        <div className="flex flex-col gap-2.5">
          {memberRows.map((p) => {
            const bal = balances[p.id] ?? 0n;
            return (
              <div
                key={p.id}
                className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <Avatar initials={p.initials} color={p.color} size={38} />
                <span
                  className="flex-1 text-[0.88rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {p.id === ME ? 'You' : p.name}
                </span>
                <span
                  className="font-mono text-[0.88rem] font-bold"
                  style={{
                    color: bal > 0n ? 'var(--c-green)' : bal < 0n ? 'var(--c-red)' : 'var(--t-dim)',
                  }}
                >
                  {bal === 0n
                    ? 'Settled'
                    : `${bal > 0n ? '+' : '-'}${formatMoney(bal < 0n ? -bal : bal, ETB)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'members' && (
        <div className="flex flex-col gap-2.5">
          {memberRows.map((p) => (
            <div
              key={p.id}
              className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
            >
              <Avatar initials={p.initials} color={p.color} size={42} />
              <div className="min-w-0 flex-1">
                <p
                  className="mb-0.5 text-[0.88rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {p.id === ME ? 'You' : p.name}
                </p>
                <span
                  className="rounded-md px-1.5 py-0.5 text-[0.66rem] font-semibold"
                  style={{
                    color: p.id === ME ? 'var(--accent)' : 'var(--t-dim)',
                    background: p.id === ME ? 'var(--accent-light)' : 'transparent',
                  }}
                >
                  {p.id === ME ? 'Admin' : 'Member'}
                </span>
              </div>
            </div>
          ))}
          <Link
            href={`/groups/${group.id}/members`}
            className="neo-btn flex items-center gap-3 rounded-2xl px-3.5 py-3"
          >
            <div
              className="neo-raised-sm flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl"
              style={{ color: 'var(--accent)' }}
            >
              <UserPlus size={19} strokeWidth={1.9} />
            </div>
            <span className="text-[0.85rem] font-semibold" style={{ color: 'var(--accent)' }}>
              Manage Members
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
