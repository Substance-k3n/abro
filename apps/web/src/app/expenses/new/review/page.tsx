'use client';

// EXP-08 Add Expense - Review & Confirm -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 938-991). Ported from the prototype's review step (App.tsx:
// 3604-3753): expense-details card, paid-by card, split breakdown with
// per-method sub-info (percentage/shares), sum validation, note field.
//
// Deviations:
//  - Receipt upload and "Make recurring" (spec's own text marks the
//    latter "(future)") are not built -- no upload UI exists anywhere in
//    this app yet, and there's nothing to wire a receipt field to.
//  - "Save as draft" was already deferred back in EXP-01 (no draft-
//    persistence layer this phase -- see expense-draft.tsx).
//  - "Create Expense" has no real API to call yet (Phase 8 wires that
//    in) -- clicking it resets the wizard draft and returns to /home,
//    simulating a successful create against mock data. There's
//    deliberately no success toast/snackbar -- no such component exists
//    in this app yet, and inventing one just for this button is more
//    than this pass needs; the draft resetting and the wizard closing
//    is itself the signal that it "worked."
//  - Spec's "Validation Check" list (Total matches split / all
//    participants assigned / all required fields filled) is rendered
//    as an actual checklist using isSplitValid + a non-empty check,
//    rather than only gating the button silently -- the point of
//    listing these in the spec is for the user to see why Create might
//    be disabled, not just have it disabled with no explanation.

import { ETB, formatMoney } from '@abro/types';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { computeShares, isSplitValid, parseAmount } from '~/lib/expense-split';
import { CATEGORIES, CURRENT_USER, FRIENDS, GROUPS, resolveParticipants } from '~/lib/mock-data';

const METHOD_LABEL: Record<string, string> = {
  equal: 'Equal',
  exact: 'Exact',
  percentage: 'Percentage',
  shares: 'Shares',
};

export default function AddExpenseReviewPage() {
  const router = useRouter();
  const { draft, update, reset } = useExpenseDraft();

  const total = parseAmount(draft.amountInput);
  const participants = resolveParticipants(draft.participantIds);
  const shares = computeShares(draft, draft.participantIds, total);
  const sumOk = isSplitValid(draft, draft.participantIds, total);
  const hasFields = draft.name.trim().length > 0 && total > 0n && draft.category.length > 0;
  const hasParticipants = draft.participantIds.length > 0;
  const canCreate = sumOk && hasFields && hasParticipants;

  const category = CATEGORIES.find((c) => c.label === draft.category);
  const group = draft.groupId ? GROUPS.find((g) => g.id === draft.groupId) : null;
  const payer =
    draft.payerId === ME
      ? { name: 'You', initials: CURRENT_USER.initials, color: CURRENT_USER.color }
      : FRIENDS.find((f) => f.id === draft.payerId);

  const createExpense = () => {
    // Mock create -- no apps/api endpoint to call yet (Phase 8). Reset
    // the draft so a fresh /expenses/new starts clean, then leave the
    // wizard.
    reset();
    router.push('/home');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/expenses/new/split')}
          className="text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Back
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Review
        </h2>
        <div className="w-[60px]" />
      </div>

      {/* Expense details */}
      <div className="neo-raised-sm rounded-[18px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Expense details
          </p>
          <button
            onClick={() => router.push('/expenses/new')}
            className="text-[0.72rem] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            Edit
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <Row label="Name" value={draft.name || '—'} />
          <Row
            label="Category"
            value={category ? `${category.icon} ${category.label}` : draft.category}
          />
          <Row label="Date" value={draft.date} />
          <Row label="Amount" value={formatMoney(total, ETB)} mono />
          {group && <Row label="Group" value={`${group.icon} ${group.name}`} />}
        </div>
      </div>

      {/* Paid by */}
      <div className="neo-raised-sm rounded-[18px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Paid by
          </p>
          <button
            onClick={() => router.push('/expenses/new/payer')}
            className="text-[0.72rem] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            Edit
          </button>
        </div>
        {payer && (
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white"
              style={{ background: payer.color }}
            >
              {payer.initials}
            </div>
            <span
              className="flex-1 text-[0.88rem] font-semibold"
              style={{ color: 'var(--t-primary)' }}
            >
              {payer.name}
            </span>
            <span
              className="font-mono text-[0.9rem] font-bold"
              style={{ color: 'var(--t-primary)' }}
            >
              {formatMoney(total, ETB)}
            </span>
          </div>
        )}
      </div>

      {/* Split breakdown */}
      <div className="neo-raised-sm rounded-[18px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Split
          </p>
          <div className="flex items-center gap-2">
            <span
              className="rounded-lg px-2 py-0.5 text-[0.72rem] font-semibold"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {METHOD_LABEL[draft.splitMethod]}
            </span>
            <button
              onClick={() => router.push('/expenses/new/split')}
              className="text-[0.72rem] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Edit
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
                style={{ background: p.color }}
              >
                {p.initials}
              </div>
              <span className="flex-1 text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
                {p.id === ME ? 'You' : p.name}
              </span>
              <span
                className="font-mono text-[0.88rem] font-bold"
                style={{ color: 'var(--t-primary)' }}
              >
                {formatMoney(shares[p.id] ?? 0n, ETB)}
              </span>
            </div>
          ))}
        </div>
        <div className="neo-inset-sm mt-3 flex items-center justify-between rounded-xl px-3.5 py-2.5">
          <span className="text-[0.78rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
            Total
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono text-[0.9rem] font-bold"
              style={{ color: 'var(--t-primary)' }}
            >
              {formatMoney(total, ETB)}
            </span>
            {sumOk ? (
              <CheckCircle2 size={16} strokeWidth={1.75} style={{ color: 'var(--c-green)' }} />
            ) : (
              <XCircle size={16} strokeWidth={1.75} style={{ color: 'var(--c-red)' }} />
            )}
          </div>
        </div>
      </div>

      {/* Validation checklist */}
      <div className="flex flex-col gap-1.5 px-1">
        <CheckRow ok={sumOk} label="Total matches split" />
        <CheckRow ok={hasParticipants} label="All participants assigned" />
        <CheckRow ok={hasFields} label="All required fields filled" />
      </div>

      {/* Note */}
      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Note <span style={{ fontWeight: 400, color: 'var(--t-dim)' }}>(optional)</span>
        </label>
        <textarea
          className="neo-input resize-none"
          placeholder="Add a note…"
          rows={2}
          value={draft.note}
          onChange={(e) => update({ note: e.target.value })}
          style={{ color: 'var(--t-primary)' }}
        />
      </div>

      <button
        onClick={createExpense}
        disabled={!canCreate}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Create Expense
      </button>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
        {label}
      </span>
      <span
        className={`text-[0.88rem] font-semibold ${mono ? 'font-mono' : ''}`}
        style={{ color: 'var(--t-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--c-green)' }} />
      ) : (
        <XCircle size={14} strokeWidth={2} style={{ color: 'var(--c-red)' }} />
      )}
      <span className="text-[0.76rem]" style={{ color: ok ? 'var(--t-muted)' : 'var(--c-red)' }}>
        {label}
      </span>
    </div>
  );
}
