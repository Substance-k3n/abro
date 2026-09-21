'use client';

// DASH-06 Balances Overview — docs/ABRO_FRONTEND_SPEC.md §3 (lines 476-528):
//   "Purpose: Complete balance summary. Route: /balances. Header: Title
//   'Balances', Filter/Sort button. Summary Cards: 1. Total Balance Card
//   (total owed to you [green], total you owe [red], net balance [large]).
//   2. Currency Breakdown (if multi-currency) — balance per currency,
//   collapsible. Balance List grouped by: People who owe you / People you
//   owe / Groups (separate section). Each item: avatar, name, amount, quick
//   settle button. Filters: all balances / only friends / only groups /
//   specific currency. Components: summary cards, balance list item, filter
//   sheet, empty state. Interactions: tap balance -> friend/group detail,
//   quick settle, apply filters. State: all balances, active filters,
//   loading state."
//
// No prototype reference exists for this screen (the Figma Make prototype's
// App.tsx has no Balances Overview screen) -- designed fresh from the spec
// text above, reusing Home's (DASH-01) exact balance patterns: same bigint
// owed/owe/net reduce over FRIENDS/GROUPS, same BalanceCard/PersonRow/
// MoneyDisplay/AmountBadge/GroupIcon/SectionLabel components, same
// neo-card/neo-raised-sm styling conventions. Filter tabs (.neo-tab/.active)
// follow Activity's (DASH-02) established inline-pill pattern rather than a
// full filter sheet/modal, consistent with the spec-vs-prototype deviations
// already made on those screens.
//
// Deviations/omissions (Confirmed -- app is single-currency today):
//  - Currency Breakdown card: omitted, not built as a fake collapsible. The
//    app only supports ETB right now (mock-data.ts + @abro/ui all use the
//    single `ETB` CurrencyMeta), so a "balance per currency, collapsible"
//    section would have exactly one row -- nothing to break down or
//    collapse. Revisit once multi-currency lands.
//  - "Specific currency" filter: omitted for the same reason (single
//    currency = a no-op filter).
//  - Header's "Filter/Sort button" -> inline filter tabs (All / Friends
//    only / Groups only), no separate sort control -- the spec doesn't
//    define sort keys/order for this screen and the mock lists are short
//    enough not to need one.
//  - "Loading state" (spec's State list): not applicable yet -- mock data
//    is synchronous/local, same as every other Phase 3 dashboard screen.
//    Phase 8 (real API) is when this needs a real loading/skeleton state.

import {
  AmountBadge,
  BalanceCard,
  EmptyState,
  GroupIcon,
  MoneyDisplay,
  PersonRow,
  SectionLabel,
} from '@abro/ui';
import { Handshake } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FRIENDS, GROUPS } from '~/lib/mock-data';

type FilterKey = 'all' | 'friends' | 'groups';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'friends', label: 'Friends only' },
  { key: 'groups', label: 'Groups only' },
];

export default function BalancesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('all');

  // Total Balance Card: friends + groups combined, same bigint reduce
  // pattern as Home (DASH-01).
  const friendOwedTotal = FRIENDS.reduce((sum, f) => sum + f.owes, 0n);
  const friendOweTotal = FRIENDS.reduce((sum, f) => sum + f.iOwe, 0n);
  const groupOwedTotal = GROUPS.filter((g) => g.balance > 0n).reduce(
    (sum, g) => sum + g.balance,
    0n,
  );
  const groupOweTotal = GROUPS.filter((g) => g.balance < 0n).reduce(
    (sum, g) => sum - g.balance,
    0n,
  );
  const owedTotal = friendOwedTotal + groupOwedTotal;
  const oweTotal = friendOweTotal + groupOweTotal;
  const net = owedTotal - oweTotal;

  const owedToYou = FRIENDS.filter((f) => f.owes > 0n);
  const youOwe = FRIENDS.filter((f) => f.iOwe > 0n);
  const groupsWithBalance = GROUPS.filter((g) => g.balance !== 0n);

  const showFriends = filter !== 'groups';
  const showGroups = filter !== 'friends';

  const visibleFriendCount = showFriends ? owedToYou.length + youOwe.length : 0;
  const visibleGroupCount = showGroups ? groupsWithBalance.length : 0;
  const isEmpty = visibleFriendCount + visibleGroupCount === 0;

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:px-8 md:py-8">
      {/* Header */}
      <h2
        className="font-display mb-5 text-[1.5rem] font-extrabold tracking-tighter"
        style={{ color: 'var(--t-primary)' }}
      >
        Balances
      </h2>

      {/* Filter tabs -- stands in for the spec's "Filter/Sort button" +
          filter sheet; see header comment. */}
      <div className="neo-inset-sm hide-scroll mb-5 flex max-w-xl gap-1 overflow-x-auto rounded-[14px] p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`neo-tab whitespace-nowrap border-none ${filter === f.key ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Total Balance Card */}
      <div className="mb-6 max-w-xl">
        <BalanceCard net={net} owedTotal={owedTotal} oweTotal={oweTotal} />
      </div>

      {/* Currency Breakdown: not applicable -- see header comment (ETB-only
          app, nothing to break down or collapse). */}

      {isEmpty ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="All settled up"
          description="No outstanding balances to show for this filter."
        />
      ) : (
        <div className="flex max-w-xl flex-col gap-6">
          {showFriends && (owedToYou.length > 0 || youOwe.length > 0) && (
            <div className="flex flex-col gap-4">
              {owedToYou.length > 0 && (
                <div>
                  <SectionLabel>People who owe you</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {owedToYou.map((f) => (
                      <div key={f.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <PersonRow
                            initials={f.initials}
                            color={f.color}
                            name={f.name}
                            right={<AmountBadge amount={f.owes} dir="receive" />}
                            onClick={() => router.push(`/friends/${f.id}`)}
                          />
                        </div>
                        <Link
                          href={`/settle?friendId=${f.id}`}
                          className="neo-btn shrink-0 rounded-xl px-3 py-2 text-[0.72rem] font-semibold"
                        >
                          Settle
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {youOwe.length > 0 && (
                <div>
                  <SectionLabel>People you owe</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {youOwe.map((f) => (
                      <div key={f.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <PersonRow
                            initials={f.initials}
                            color={f.color}
                            name={f.name}
                            right={<AmountBadge amount={f.iOwe} dir="owe" />}
                            onClick={() => router.push(`/friends/${f.id}`)}
                          />
                        </div>
                        <Link
                          href={`/settle?friendId=${f.id}`}
                          className="neo-btn shrink-0 rounded-xl px-3 py-2 text-[0.72rem] font-semibold"
                        >
                          Settle
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showGroups && groupsWithBalance.length > 0 && (
            <div>
              <SectionLabel>Groups</SectionLabel>
              <div className="flex flex-col gap-2">
                {groupsWithBalance.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Link
                      href={`/groups/${g.id}`}
                      className="neo-raised-sm flex flex-1 items-center gap-3 rounded-2xl px-3.5 py-3"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
                        style={{ background: `${g.color}22`, color: g.color }}
                      >
                        <GroupIcon icon={g.icon} size={19} />
                      </div>
                      <span
                        className="flex-1 text-[0.88rem] font-semibold"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {g.name}
                      </span>
                      <MoneyDisplay
                        amount={g.balance < 0n ? -g.balance : g.balance}
                        className="font-mono text-sm font-semibold"
                        style={{ color: g.balance > 0n ? 'var(--c-green)' : 'var(--c-red)' }}
                      />
                    </Link>
                    <Link
                      href={`/settle?groupId=${g.id}`}
                      className="neo-btn shrink-0 rounded-xl px-3 py-2 text-[0.72rem] font-semibold"
                    >
                      Settle
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
