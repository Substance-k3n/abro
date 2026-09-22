'use client';

// EXP-10 Edit Expense -- docs/ABRO_FRONTEND_SPEC.md §4 (lines 1064-
// 1097). Outside the (dashboard) route group, matching /expenses/new's
// treatment ("similar to Add Expense flow" per spec, and the same
// focused-flow reasoning from that layout's header comment).
//
// Deliberately scoped down from a full pre-filled re-run of the 8-step
// wizard: EXP-10 is the last, smallest screen in Phase 4, and rebuilding
// every wizard step to also support an "edit an existing expense" mode
// (prefilling, re-deriving original split-method inputs, etc.) is a
// disproportionate amount of new machinery for what the spec itself
// describes as "similar to Add Expense... but pre-filled" -- not a
// requirement that every step exist standalone for editing too.
//
// What's editable here: name, category, amount, date, note,
// participants (toggle on/off). What's NOT independently editable: the
// split METHOD (exact/percentage/shares amounts can't be hand-tuned in
// this screen) -- changing the amount or participant set always
// recalculates an equal split among the (possibly new) participants,
// shown via the spec's own suggested warning copy ("Changing amount
// will recalculate all shares" / "Removing participants will update
// balances"). If nothing split-relevant changed, the original shares
// (and original split method label) are preserved untouched, even for
// a non-equal original split -- there's nothing to recalculate.

import { ETB, formatMoney, splitEqually } from '@abro/types';
import { PersonRow } from '@abro/ui';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import {
  CATEGORIES,
  EXPENSES,
  FRIENDS,
  GROUPS,
  resolveParticipants,
  updateExpense,
} from '~/lib/mock-data';

export default function EditExpensePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const original = EXPENSES.find((e) => e.id === params.id);

  const [name, setName] = useState(original?.name ?? '');
  const [category, setCategory] = useState(original?.category ?? 'Food');
  const [amountInput, setAmountInput] = useState(() =>
    original ? (Number(original.amount) / 10 ** ETB.decimalDigits).toString() : '',
  );
  const [date, setDate] = useState(original?.date ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(original?.participantIds ?? []);

  if (!original) {
    return (
      <div className="fade-in mx-auto max-w-xl px-5 py-6 md:px-8 md:py-8">
        <p style={{ color: 'var(--t-muted)' }}>Expense not found.</p>
      </div>
    );
  }

  const amount = BigInt(Math.round((Number(amountInput) || 0) * 10 ** ETB.decimalDigits));
  const amountChanged = amount !== original.amount;
  const participantsChanged =
    participantIds.length !== original.participantIds.length ||
    !participantIds.every((id) => original.participantIds.includes(id));
  const willRecalculate = amountChanged || participantsChanged;
  const group = original.groupId ? GROUPS.find((g) => g.id === original.groupId) : null;
  const isValid = name.trim().length > 0 && amount > 0n && participantIds.length > 0;

  const toggleParticipant = (id: string) => {
    if (id === ME && original.payerId === ME) {
      return; // locked -- same rule as EXP-03, you can't remove yourself as payer.
    }
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const saveExpense = () => {
    const shares = willRecalculate
      ? Object.fromEntries(
          participantIds.map((id, i) => [id, splitEqually(amount, participantIds.length)[i]!]),
        )
      : original.shares;

    updateExpense(original.id, {
      name: name.trim(),
      category,
      amount,
      date,
      note: note.trim(),
      participantIds,
      shares,
      splitMethod: willRecalculate ? 'equal' : original.splitMethod,
      updatedBy: ME,
      updatedAt: 'Just now',
    });
    router.push(`/expenses/${original.id}`);
  };

  const candidateIds = Array.from(
    new Set([ME, ...(group?.memberIds ?? []), ...FRIENDS.map((f) => f.id)]),
  );
  const candidates = resolveParticipants(candidateIds);

  return (
    <div className="fade-in mx-auto flex max-w-xl flex-col gap-5 px-5 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/expenses/${original.id}`)}
          className="text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Cancel
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Edit Expense
        </h2>
        <div className="w-[60px]" />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Expense name
        </label>
        <input
          className="neo-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ color: 'var(--t-primary)' }}
        />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Amount
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[0.9rem] font-semibold"
            style={{ color: 'var(--t-dim)' }}
          >
            ETB
          </span>
          <input
            className="neo-input font-mono text-[1.1rem] font-bold"
            type="number"
            min="0"
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            style={{ color: 'var(--t-primary)', paddingLeft: 52 }}
          />
        </div>
        {amountChanged && (
          <p className="mt-1.5 pl-1 text-[0.72rem]" style={{ color: 'var(--c-amber)' }}>
            Changing the amount will recalculate all shares.
          </p>
        )}
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Category
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => setCategory(c.label)}
              className={`cat-pill border-none ${category === c.label ? 'selected' : ''}`}
            >
              <span>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Date
        </label>
        <input
          className="neo-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ color: 'var(--t-primary)' }}
        />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Participants
        </label>
        <div className="flex flex-col gap-2">
          {candidates.map((p) => (
            <PersonRow
              key={p.id}
              initials={p.initials}
              color={p.color}
              name={p.id === ME ? 'You' : p.name}
              right={
                <span
                  className="text-[0.75rem] font-semibold"
                  style={{
                    color: participantIds.includes(p.id) ? 'var(--accent)' : 'var(--t-dim)',
                  }}
                >
                  {participantIds.includes(p.id) ? 'Included' : 'Add'}
                </span>
              }
              onClick={() => toggleParticipant(p.id)}
            />
          ))}
        </div>
        {participantsChanged && (
          <p className="mt-1.5 pl-1 text-[0.72rem]" style={{ color: 'var(--c-amber)' }}>
            Changing participants will update balances{group ? ' and this group' : ''}.
          </p>
        )}
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Note <span style={{ fontWeight: 400, color: 'var(--t-dim)' }}>(optional)</span>
        </label>
        <textarea
          className="neo-input resize-none"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ color: 'var(--t-primary)' }}
        />
      </div>

      {willRecalculate && (
        <div className="neo-inset-sm rounded-[14px] px-3.5 py-3">
          <p className="text-[0.78rem]" style={{ color: 'var(--t-muted)' }}>
            New split: {formatMoney(amount, ETB)} equally among {participantIds.length} participant
            {participantIds.length !== 1 ? 's' : ''}.
          </p>
        </div>
      )}

      <button
        onClick={saveExpense}
        disabled={!isValid}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Update
      </button>
    </div>
  );
}
