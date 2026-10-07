'use client';

// GRP-03 Group Detail View -- docs/ABRO_FRONTEND_SPEC.md §5 (lines
// 1198-1263). Info card, your balance, quick actions, and Expenses /
// Balances / Members tabs. Phase 8 slice 8b: reads the real group via
// ~/lib/group-view.tsx (group, members, per-member nets) plus the
// group's latest expenses (GET /expenses?groupId=).
//
// Deviations:
//  - Settings icon shows for every member: GRP-07 is editable by
//    admins only, but it's also where anyone leaves the group (8d). The
//    separate "More menu" is dropped (nothing to put in it beyond what
//    settings covers).
//  - Quick Actions render as a row of buttons, not floating action
//    buttons -- same simplification as Home's Quick Actions grid.
//  - Expenses tab previews the latest few; "See all" opens GRP-04.
//  - Settle Up only shows when you owe the group net: apps/api only
//    lets the debtor record a settlement (ADR-003).
//  - Members tab lists ACTIVE members; pending invites are on GRP-06.
//  - Admins get a fourth quick action, Dashboard (roadmap P6), opening
//    /groups/[id]/admin.

import { ETB, abs, formatMoney } from '@abro/types';
import { ActivityItem, EmptyState } from '@abro/ui';
import {
  ArrowLeft,
  Handshake,
  LayoutDashboard,
  Plus,
  Receipt,
  Settings,
  Split,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { type AuthExpense, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { type GroupView, GroupViewLoader, PersonAvatar, nameIn } from '~/lib/group-view';
import { groupTypeFor } from '~/lib/groups-api';
import { GroupPicture } from '~/components/GroupPicture';
import { photoSrc } from '~/lib/photos';

type Tab = 'expenses' | 'balances' | 'members';

const PREVIEW_COUNT = 5;

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const [expenses, setExpenses] = useState<AuthExpense[]>([]);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={() => listExpenses({ groupId: params.id, limit: PREVIEW_COUNT + 1 }).then(setExpenses)}
    >
      {(view) => <GroupDetail view={view} expenses={expenses} />}
    </GroupViewLoader>
  );
}

function GroupDetail({ view, expenses }: { view: GroupView; expenses: AuthExpense[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('expenses');
  const { group, profile, myMembership, activeMembers, nets } = view;
  const type = groupTypeFor(group.type);
  const myNet = nets.get(profile.id) ?? 0n;
  const owes = myNet < 0n;
  const isAdmin = myMembership.role === 'ADMIN';
  const groupNames = new Map([[group.id, group.name]]);

  // Everyone with a balance, active or not, then active members at 0.
  const balanceIds = [
    ...activeMembers.map((m) => m.userId),
    ...[...nets.keys()].filter((id) => !activeMembers.some((m) => m.userId === id)),
  ];

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
          aria-label="Group settings"
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <Settings size={17} strokeWidth={2} />
        </Link>
      </div>

      {/* Group info card */}
      <div className="neo-raised-lg mb-4 rounded-3xl p-5">
        <div className="mb-4 flex items-center gap-3.5">
          <div
            className="neo-raised-sm relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
            style={{ color: type.color }}
          >
            <GroupPicture photo={photoSrc(group.photoUrl)} icon={type.icon} size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="rounded-lg px-2 py-0.5 text-[0.72rem] font-semibold"
                style={{ background: type.tint, color: type.color }}
              >
                {type.label}
              </span>
            </div>
            <p className="text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
              {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''} · Created{' '}
              {new Date(group.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            {group.description && (
              <p className="mt-1 text-[0.78rem]" style={{ color: 'var(--t-muted)' }}>
                {group.description}
              </p>
            )}
          </div>
        </div>

        <div className="neo-inset-sm flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <p className="mb-0.5 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
              Your balance in this group
            </p>
            <p
              className="font-display text-[1.3rem] font-extrabold tracking-tight"
              style={{
                color: myNet < 0n ? 'var(--c-red)' : myNet > 0n ? 'var(--c-green)' : 'var(--t-dim)',
              }}
            >
              {myNet === 0n
                ? 'Settled'
                : `${myNet < 0n ? '-' : '+'}${formatMoney(abs(myNet), ETB)}`}
            </p>
          </div>
          {owes && (
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
      <div className={`mb-5 grid gap-2.5 ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <Link
          href={`/expenses/new?groupId=${group.id}`}
          className="neo-btn-accent flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
        >
          <Plus size={18} strokeWidth={2} />
          <span className="text-[0.68rem] font-medium">Add Expense</span>
        </Link>
        {owes ? (
          <Link
            href={`/settle?groupId=${group.id}`}
            className="neo-btn flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
            style={{ color: 'var(--t-secondary)' }}
          >
            <Handshake size={18} strokeWidth={2} />
            <span className="text-[0.68rem] font-medium">Settle Up</span>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="You don't owe this group anything"
            className="neo-flat flex cursor-not-allowed flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center opacity-50"
            style={{ color: 'var(--t-secondary)' }}
          >
            <Handshake size={18} strokeWidth={2} />
            <span className="text-[0.68rem] font-medium">Settle Up</span>
          </button>
        )}
        <Link
          href={`/groups/${group.id}/simplified`}
          className="neo-btn flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
          style={{ color: 'var(--t-secondary)' }}
        >
          <Split size={18} strokeWidth={2} />
          <span className="text-[0.68rem] font-medium">Simplify</span>
        </Link>
        {isAdmin && (
          <Link
            href={`/groups/${group.id}/admin`}
            className="neo-btn flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
            style={{ color: 'var(--t-secondary)' }}
          >
            <LayoutDashboard size={18} strokeWidth={2} />
            <span className="text-[0.68rem] font-medium">Dashboard</span>
          </Link>
        )}
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
        (expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt size={26} strokeWidth={1.5} />}
            title="No expenses yet"
            description="Add the first expense for this group."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {expenses.slice(0, PREVIEW_COUNT).map((e) => (
              <ActivityItem
                key={e.id}
                {...toActivityDisplay(e, profile.id, groupNames)}
                onClick={() => router.push(`/expenses/${e.id}`)}
              />
            ))}
            <Link
              href={`/groups/${group.id}/expenses`}
              className="py-1 text-center text-[0.82rem] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              {expenses.length > PREVIEW_COUNT ? 'See all expenses' : 'Filter expenses'}
            </Link>
          </div>
        ))}

      {tab === 'balances' && (
        <div className="flex flex-col gap-2.5">
          {balanceIds.map((id) => {
            const bal = nets.get(id) ?? 0n;
            return (
              <div
                key={id}
                className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <PersonAvatar view={view} userId={id} size={38} />
                <span
                  className="flex-1 text-[0.88rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {nameIn(view, id)}
                  {!activeMembers.some((m) => m.userId === id) && (
                    <span
                      className="ml-1.5 text-[0.7rem] font-normal"
                      style={{ color: 'var(--t-dim)' }}
                    >
                      (left)
                    </span>
                  )}
                </span>
                <span
                  className="font-mono text-[0.88rem] font-bold"
                  style={{
                    color: bal > 0n ? 'var(--c-green)' : bal < 0n ? 'var(--c-red)' : 'var(--t-dim)',
                  }}
                >
                  {bal === 0n ? 'Settled' : `${bal > 0n ? '+' : '-'}${formatMoney(abs(bal), ETB)}`}
                </span>
              </div>
            );
          })}
          <Link
            href={`/groups/${group.id}/balances`}
            className="py-1 text-center text-[0.82rem] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            Who pays whom
          </Link>
        </div>
      )}

      {tab === 'members' && (
        <div className="flex flex-col gap-2.5">
          {activeMembers.map((m) => (
            <div
              key={m.id}
              className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
            >
              <PersonAvatar view={view} userId={m.userId} size={42} />
              <div className="min-w-0 flex-1">
                <p
                  className="mb-0.5 text-[0.88rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {nameIn(view, m.userId)}
                </p>
                <span
                  className="rounded-md px-1.5 py-0.5 text-[0.66rem] font-semibold"
                  style={{
                    color: m.role === 'ADMIN' ? 'var(--accent)' : 'var(--t-dim)',
                    background: m.role === 'ADMIN' ? 'var(--accent-light)' : 'transparent',
                  }}
                >
                  {m.role === 'ADMIN' ? 'Admin' : 'Member'}
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
              {isAdmin ? 'Manage Members' : 'All Members'}
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
