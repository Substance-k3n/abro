'use client';

// STL-05 Settlement History -- docs/ABRO_FRONTEND_SPEC.md §6 (lines
// 1708-1747). Closes out Phase 6 (Settlement).
//
// Reads `SETTLEMENTS` (~/lib/mock-data.ts), not `ACTIVITIES` -- the
// header comment above `SETTLEMENTS` in mock-data.ts already earmarks it
// for "STL-05 history" specifically because it carries fields ACTIVITIES
// doesn't (method, note, groupId), which this screen's rows need.
// Entry point: STL-04's "View balance history" button already links to
// `/settlements` (built before this route existed, same phased-landing
// pattern as every other cross-phase link in this app).
//
// Deviations (Confirmed, same reasoning already established on DASH-02
// Activity for the identical underlying gap):
//  - "By date range" filter: omitted. SETTLEMENTS' `date` field is a
//    display string ("Yesterday", "Sat", "Just now"), not a real
//    Date -- there's nothing to range over yet. Revisit once Phase 8
//    wires real timestamps from the API.
//  - "By person" filter: folded into the search box (case-insensitive
//    match against the resolved counterparty's name), rather than a
//    separate control -- same simplification Activity made for its own
//    search-doubles-as-filter behavior.
//  - "Filter button" in the header: inline `.neo-tab` pills (All / You
//    paid / You received), matching every other list screen's filter
//    pattern in this app (Activity, Balances, Group Expenses) instead of
//    a filter sheet/modal.
//  - "Tap settlement -> Detail view": no STL-0x detail screen exists for
//    a single settlement (the spec's screen list stops at STL-05). Tap
//    instead navigates to the settlement's context -- the group it
//    belongs to, or the counterparty's friend page for personal
//    settlements -- same "drill into the real related record" choice
//    Activity makes for expense rows.

import { ETB } from '@abro/types';
import { ActivityItem, EmptyState } from '@abro/ui';
import { ArrowLeft, Handshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { GROUPS, SETTLEMENTS, resolveParticipants } from '~/lib/mock-data';

type FilterKey = 'all' | 'paid' | 'received';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'You paid' },
  { key: 'received', label: 'You received' },
];

export default function SettlementsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  // Reverse-chronological: createSettlement appends to SETTLEMENTS, so the
  // most recent record is always last.
  const rows = [...SETTLEMENTS].reverse().map((s) => {
    const youPaid = s.fromUserId === 'me';
    const counterpartyId = youPaid ? s.toUserId : s.fromUserId;
    const counterparty = resolveParticipants([counterpartyId])[0]!;
    const group = s.groupId ? GROUPS.find((g) => g.id === s.groupId) : undefined;
    return {
      record: s,
      youPaid,
      counterparty,
      group,
      title: youPaid ? `You paid ${counterparty.name}` : `${counterparty.name} paid you`,
      sub: [s.method, group?.name].filter(Boolean).join(' · ') + (s.note ? ` — ${s.note}` : ''),
    };
  });

  const filtered = rows.filter((r) => {
    if (filter === 'paid' && !r.youPaid) {
      return false;
    }
    if (filter === 'received' && r.youPaid) {
      return false;
    }
    if (q && !r.counterparty.name.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Settlements
        </h2>
        <div className="w-[52px]" />
      </div>

      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by person"
          className="neo-input"
        />
      </div>

      <div className="neo-inset-sm hide-scroll mb-5 flex gap-1 overflow-x-auto rounded-[14px] p-1">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="No settlements found"
          description="Try a different filter or search term."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <ActivityItem
              key={r.record.id}
              category="Settlement"
              title={r.title}
              sub={r.sub}
              amount={r.record.amount}
              dir={r.youPaid ? 'paid' : 'receive'}
              time={r.record.date}
              currency={ETB}
              onClick={() =>
                router.push(r.group ? `/groups/${r.group.id}` : `/friends/${r.counterparty.id}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
