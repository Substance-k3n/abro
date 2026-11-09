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
//  - "Whose turn to pay" card (ADR-025, not in the spec): the next three
//    members who owe the group, most first, from apps/api's
//    next-payers line. Hidden when nobody owes.
//  - When late fees are on (ADR-026), the info card says so and on
//    what terms, so nobody is surprised by one.

import { EmptyState } from '@abro/ui';
import {
  ArrowLeft,
  Clock,
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

import { type NextPayer, getNextPayers } from '~/lib/balances-api';
import { type AuthExpense, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { type GroupView, GroupViewLoader, PersonAvatar, nameIn } from '~/lib/group-view';
import { groupTypeFor, lateFeeTerms } from '~/lib/groups-api';
import { ActivityRow } from '~/components/ActivityRow';
import { GroupPicture } from '~/components/GroupPicture';
import { Amount, Panel, Row, SectionHeader, Tile } from '~/components/refresh';
import { photoSrc } from '~/lib/photos';

type Tab = 'expenses' | 'balances' | 'members';

const PREVIEW_COUNT = 5;
const NEXT_PAYERS_SHOWN = 3;

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const [expenses, setExpenses] = useState<AuthExpense[]>([]);
  const [nextPayers, setNextPayers] = useState<NextPayer[]>([]);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={async () => {
        await Promise.all([
          listExpenses({ groupId: params.id, limit: PREVIEW_COUNT + 1 }).then(setExpenses),
          getNextPayers(params.id).then((r) => setNextPayers(r.payers)),
        ]);
      }}
    >
      {(view) => <GroupDetail view={view} expenses={expenses} nextPayers={nextPayers} />}
    </GroupViewLoader>
  );
}

function GroupDetail({
  view,
  expenses,
  nextPayers,
}: {
  view: GroupView;
  expenses: AuthExpense[];
  nextPayers: NextPayer[];
}) {
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

  const terms = lateFeeTerms(group);

  return (
    <div className="px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push('/groups')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Groups
        </button>
        <Link
          href={`/groups/${group.id}/settings`}
          aria-label="Group settings"
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <Settings size={17} strokeWidth={2} />
        </Link>
      </div>

      {/* The group and where you stand in it */}
      <section className="neo-raised-lg mb-5 rounded-[28px] p-5">
        <div className="flex items-center gap-3.5">
          <div
            className="neo-raised-sm relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
            style={{ color: type.color }}
          >
            <GroupPicture photo={photoSrc(group.photoUrl)} icon={type.icon} size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="font-display truncate text-[1.35rem] font-semibold tracking-tight"
              style={{ color: 'var(--t-primary)' }}
            >
              {group.name}
            </h1>
            <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
              {type.label} · {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''} ·
              since{' '}
              {new Date(group.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
        {group.description && (
          <p className="mt-3 text-[0.84rem]" style={{ color: 'var(--t-muted)' }}>
            {group.description}
          </p>
        )}
        {terms && (
          <p
            className="mt-3 flex items-start gap-2 text-[0.78rem]"
            style={{ color: 'var(--t-muted)' }}
          >
            <Clock
              size={14}
              strokeWidth={2}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--c-amber)' }}
              aria-hidden
            />
            <span>Late fees: {terms}.</span>
          </p>
        )}

        <div className="neo-inset-sm mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5">
          <div>
            <p className="text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
              {myNet > 0n ? "You're owed" : myNet < 0n ? 'You owe' : 'Your balance'}
            </p>
            {myNet === 0n ? (
              <p
                className="font-display mt-0.5 text-[1.3rem] font-semibold"
                style={{ color: 'var(--t-secondary)' }}
              >
                Settled
              </p>
            ) : (
              <p className="mt-0.5">
                <Amount value={myNet} tone={myNet > 0n ? 'owed' : 'owe'} size="lg" />
              </p>
            )}
          </div>
          {owes && (
            <Link
              href={`/settle?groupId=${group.id}`}
              className="neo-btn-accent rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold"
            >
              Settle up
            </Link>
          )}
        </div>
      </section>

      {nextPayers.length > 0 && (
        <NextPayersCard view={view} payers={nextPayers.slice(0, NEXT_PAYERS_SHOWN)} />
      )}

      {/* Actions: one main one, three quieter ones */}
      <div className="mb-6 grid grid-cols-[1.7fr_1fr_1fr_1fr] gap-2.5">
        <Link
          href={`/expenses/new?groupId=${group.id}`}
          className="neo-btn-accent flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 py-4 text-[0.86rem] font-semibold"
        >
          <Plus size={18} strokeWidth={2.2} />
          Add expense
        </Link>
        {owes ? (
          <Link
            href={`/settle?groupId=${group.id}`}
            className="neo-btn flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center"
            style={{ color: 'var(--t-secondary)' }}
          >
            <Handshake size={18} strokeWidth={1.9} />
            <span className="text-[0.68rem] font-medium">Settle up</span>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="You don't owe this group anything"
            className="neo-flat flex cursor-not-allowed flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center opacity-50"
            style={{ color: 'var(--t-secondary)' }}
          >
            <Handshake size={18} strokeWidth={1.9} />
            <span className="text-[0.68rem] font-medium">Settle up</span>
          </button>
        )}
        <Link
          href={`/groups/${group.id}/simplified`}
          className="neo-btn flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center"
          style={{ color: 'var(--t-secondary)' }}
        >
          <Split size={18} strokeWidth={1.9} />
          <span className="text-[0.68rem] font-medium">Simplify</span>
        </Link>
        <Link
          href={`/groups/${group.id}/admin`}
          className="neo-btn flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center"
          style={{ color: 'var(--t-secondary)' }}
        >
          <LayoutDashboard size={18} strokeWidth={1.9} />
          <span className="text-[0.68rem] font-medium">Dashboard</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="neo-inset-sm mb-4 flex gap-1 rounded-2xl p-1" role="tablist">
        {(['expenses', 'balances', 'members'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
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
          <>
            <Panel>
              {expenses.slice(0, PREVIEW_COUNT).map((e) => (
                <ActivityRow
                  key={e.id}
                  a={toActivityDisplay(e, profile.id, groupNames)}
                  onClick={() => router.push(`/expenses/${e.id}`)}
                />
              ))}
            </Panel>
            <Link
              href={`/groups/${group.id}/expenses`}
              className="mt-3 block py-1 text-center text-[0.84rem] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              {expenses.length > PREVIEW_COUNT ? 'See all expenses' : 'Filter expenses'}
            </Link>
          </>
        ))}

      {tab === 'balances' && (
        <>
          <Panel>
            {balanceIds.map((id) => {
              const bal = nets.get(id) ?? 0n;
              const left = !activeMembers.some((m) => m.userId === id);
              return (
                <Row
                  key={id}
                  leading={<PersonAvatar view={view} userId={id} size={38} />}
                  title={
                    <>
                      {nameIn(view, id)}
                      {left && (
                        <span
                          className="ml-1.5 text-[0.72rem] font-normal"
                          style={{ color: 'var(--t-dim)' }}
                        >
                          (left)
                        </span>
                      )}
                    </>
                  }
                  sub={bal > 0n ? 'is owed' : bal < 0n ? 'owes' : 'settled'}
                  subTone={bal > 0n ? 'owed' : bal < 0n ? 'owe' : 'plain'}
                  trailing={
                    bal === 0n ? undefined : <Amount value={bal} tone={bal > 0n ? 'owed' : 'owe'} />
                  }
                />
              );
            })}
          </Panel>
          <Link
            href={`/groups/${group.id}/balances`}
            className="mt-3 block py-1 text-center text-[0.84rem] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            Who pays whom
          </Link>
        </>
      )}

      {tab === 'members' && (
        <Panel>
          {activeMembers.map((m) => (
            <Row
              key={m.id}
              leading={<PersonAvatar view={view} userId={m.userId} size={40} />}
              title={nameIn(view, m.userId)}
              sub={m.role === 'ADMIN' ? 'Group admin' : 'Member'}
            />
          ))}
          <Row
            href={`/groups/${group.id}/members`}
            leading={
              <Tile tint="var(--accent-light)" color="var(--accent)">
                <UserPlus size={18} strokeWidth={1.9} />
              </Tile>
            }
            title={
              <span style={{ color: 'var(--accent)' }}>
                {isAdmin ? 'Manage members' : 'All members'}
              </span>
            }
            chevron
          />
        </Panel>
      )}
    </div>
  );
}

/** Who should pay the group's next bill (ADR-025): whoever pays is
 * credited, so the line re-orders itself -- if the first can't make
 * it, the next one is up. */
function NextPayersCard({ view, payers }: { view: GroupView; payers: NextPayer[] }) {
  const meNext = payers[0]?.userId === view.profile.id;
  return (
    <section className="mb-5">
      <SectionHeader title={meNext ? "You're next to pay the bill" : 'Whose turn to pay'} />
      <Panel>
        {payers.map((p, i) => (
          <Row
            key={p.userId}
            leading={<PersonAvatar view={view} userId={p.userId} size={36} />}
            title={p.userId === view.profile.id ? 'You' : nameIn(view, p.userId)}
            sub={i === 0 ? 'Next' : 'Then'}
            subTone={i === 0 ? undefined : 'plain'}
            trailing={<Amount value={p.owes} tone="owe" />}
            trailingSub="owes the group"
          />
        ))}
      </Panel>
      <p className="mt-2 px-1 text-[0.74rem]" style={{ color: 'var(--t-dim)' }}>
        Whoever owes the most pays next. Paying a bill counts toward what you owe.
      </p>
    </section>
  );
}
