'use client';

// GRP-04 Group Expenses -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1265-
// 1310). The full-page expansion of GRP-03's Expenses tab preview, with
// filtering added.
//
// Deviations:
//  - Filters: "By date range" and "By payer" (spec's filter list) are
//    dropped -- EXPENSES.date is a display-ready string, not a real
//    Date, so range filtering has nothing to parse against (same
//    reasoning Activity's DASH-02 already established); a payer filter
//    would need its own dropdown for what's usually a 2-5-person group,
//    low value for the added UI. "By category" is a real filter here,
//    built from whatever categories this group's own expenses actually
//    use (not the full CATEGORIES list, which would show mostly-empty
//    options for a small group).
//  - "Your share (highlighted)" -- shown as a signed amount (green/red)
//    reflecting whether you're the payer or not, same visual language
//    ActivityItem's `dir` already uses elsewhere in this app.

import { ETB, formatMoney } from '@abro/types';
import { EmptyState } from '@abro/ui';
import { ArrowLeft, Plus, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import { EXPENSES, GROUPS, resolveParticipants } from '~/lib/mock-data';

type Filter = 'all' | 'yours' | string;

export default function GroupExpensesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');

  const group = GROUPS.find((g) => g.id === params.id);
  const groupExpenses = group ? EXPENSES.filter((e) => e.groupId === group.id) : [];
  const categories = Array.from(new Set(groupExpenses.map((e) => e.category)));

  const filtered = groupExpenses.filter((e) => {
    if (filter === 'yours') {
      return e.payerId === ME;
    }
    if (filter !== 'all') {
      return e.category === filter;
    }
    return true;
  });

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
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="Group not found"
          description="This group doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> {group.name}
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Group Expenses
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-inset-sm hide-scroll mb-5 flex gap-1 overflow-x-auto rounded-[14px] p-1">
        {(['all', 'yours', ...categories] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`neo-tab whitespace-nowrap border-none capitalize ${filter === f ? 'active' : ''}`}
          >
            {f === 'all' ? 'All' : f === 'yours' ? 'Your expenses' : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="No expenses found"
          description="Try a different filter, or add the first expense."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((e) => {
            const share = e.shares[ME] ?? 0n;
            const payer = resolveParticipants([e.payerId])[0]!;
            return (
              <button
                key={e.id}
                onClick={() => router.push(`/expenses/${e.id}`)}
                className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="mb-0.5 truncate text-[0.88rem] font-semibold"
                    style={{ color: 'var(--t-primary)' }}
                  >
                    {e.name}
                  </p>
                  <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                    Paid by {e.payerId === ME ? 'you' : payer.name} · {e.date}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="font-mono text-[0.85rem] font-bold"
                    style={{ color: 'var(--t-primary)' }}
                  >
                    {formatMoney(e.amount, ETB)}
                  </p>
                  <p
                    className="font-mono text-[0.7rem] font-semibold"
                    style={{ color: e.payerId === ME ? 'var(--c-green)' : 'var(--c-red)' }}
                  >
                    {e.payerId === ME ? '+' : '-'}
                    {formatMoney(share, ETB)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Link
        href={`/expenses/new?groupId=${group.id}`}
        className="neo-btn-accent font-display mt-5 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
      >
        <Plus size={18} strokeWidth={2.25} /> Add Expense
      </Link>
    </div>
  );
}
