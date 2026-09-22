'use client';

// EXP-09 Expense Detail View -- docs/ABRO_FRONTEND_SPEC.md §4 (lines
// 993-1062). Uses EXPENSES (~/lib/mock-data.ts), added this PR --
// nothing in the app linked to a per-expense detail page before now
// (ActivityItem rows in Home/Activity/Friend Detail were display-only),
// so this PR also wires those onClick handlers.
//
// Deviations:
//  - Receipt section: skipped -- no receipt-upload UI exists anywhere
//    in this app yet (EXP-01/EXP-08 both deferred it for the same
//    reason), so there's nothing to show a thumbnail for.
//  - Actions menu: "Download receipt"/"Share expense" dropped for the
//    same reason (nothing to download/share yet). "Delete expense" is a
//    disabled placeholder, same pattern as Friend Detail's "Remove
//    friend" -- wiring real deletion against mock data with no
//    confirmation step would either quietly do nothing or mutate shared
//    module state destructively; being upfront that it's not built yet
//    is the honest option.
//  - "View participant profile" (spec's Interactions list): each
//    participant row links to /friends/[id] when the id resolves to a
//    real friend (not for "You").

import { EmptyState } from '@abro/ui';
import { ETB, formatMoney } from '@abro/types';
import { ArrowLeft, MoreHorizontal, Pencil, Receipt, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import { CATEGORIES, EXPENSES, GROUPS, resolveParticipants } from '~/lib/mock-data';

const METHOD_LABEL: Record<string, string> = {
  equal: 'Equal',
  exact: 'Exact',
  percentage: 'Percentage',
  shares: 'Shares',
};

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const expense = EXPENSES.find((e) => e.id === params.id);

  if (!expense) {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <button
          onClick={() => router.push('/activity')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Activity
        </button>
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="Expense not found"
          description="This expense doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  const category = CATEGORIES.find((c) => c.label === expense.category);
  const group = expense.groupId ? GROUPS.find((g) => g.id === expense.groupId) : null;
  const participants = resolveParticipants(expense.participantIds);
  const payer = resolveParticipants([expense.payerId])[0]!;
  const creator = resolveParticipants([expense.createdBy])[0]!;
  const updater = expense.updatedBy ? resolveParticipants([expense.updatedBy])[0] : null;

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2
          className="font-display flex-1 truncate px-3 text-center text-[1rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          {expense.name}
        </h2>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
          >
            <MoreHorizontal size={18} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="neo-raised-sm absolute right-0 top-11 z-10 flex w-44 flex-col gap-1 rounded-2xl p-2">
              <Link
                href={`/expenses/${expense.id}/edit`}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-medium"
                style={{ color: 'var(--t-secondary)' }}
              >
                <Pencil size={15} strokeWidth={2} /> Edit expense
              </Link>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-medium opacity-50"
                style={{ color: 'var(--c-red)' }}
              >
                <Trash2 size={15} strokeWidth={2} /> Delete expense
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="neo-raised-sm mb-4 flex flex-col items-center gap-2 rounded-[20px] p-6 text-center">
        <div
          className="neo-raised-sm flex h-14 w-14 items-center justify-center rounded-2xl text-[1.4rem]"
          style={{ color: 'var(--t-muted)' }}
        >
          {category?.icon ?? '📦'}
        </div>
        <p
          className="font-display text-[2rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          {formatMoney(expense.amount, ETB)}
        </p>
        <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
          {expense.date}
        </p>
        {group && (
          <span
            className="neo-flat mt-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            {group.icon} {group.name}
          </span>
        )}
      </div>

      {/* Paid by */}
      <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
        <p
          className="font-display mb-3 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Paid by
        </p>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold text-white"
            style={{ background: payer.color }}
          >
            {payer.initials}
          </div>
          <span
            className="flex-1 text-[0.88rem] font-semibold"
            style={{ color: 'var(--t-primary)' }}
          >
            {payer.id === ME ? 'You' : payer.name}
          </span>
          <span className="font-mono text-[0.9rem] font-bold" style={{ color: 'var(--t-primary)' }}>
            {formatMoney(expense.amount, ETB)}
          </span>
        </div>
      </div>

      {/* Split details */}
      <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Split
          </p>
          <span
            className="rounded-lg px-2 py-0.5 text-[0.72rem] font-semibold"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            {METHOD_LABEL[expense.splitMethod]}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {participants.map((p) => {
            const isYou = p.id === ME;
            const row = (
              <div className="flex flex-1 items-center gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
                  style={{ background: p.color }}
                >
                  {p.initials}
                </div>
                <span className="flex-1 text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
                  {isYou ? 'You' : p.name}
                </span>
                <span
                  className="font-mono text-[0.88rem] font-bold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {formatMoney(expense.shares[p.id] ?? 0n, ETB)}
                </span>
              </div>
            );
            return isYou ? (
              <div key={p.id} className="flex items-center gap-2.5">
                {row}
              </div>
            ) : (
              <Link key={p.id} href={`/friends/${p.id}`} className="flex items-center gap-2.5">
                {row}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      {expense.note && (
        <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
          <p
            className="font-display mb-2 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Note
          </p>
          <p className="text-[0.85rem] leading-relaxed" style={{ color: 'var(--t-secondary)' }}>
            {expense.note}
          </p>
        </div>
      )}

      {/* Activity log */}
      <div className="flex flex-col gap-1 px-1">
        <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
          Created by {creator.id === ME ? 'you' : creator.name} · {expense.createdAt}
        </p>
        {updater && (
          <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
            Updated by {updater.id === ME ? 'you' : updater.name} · {expense.updatedAt}
          </p>
        )}
      </div>
    </div>
  );
}
