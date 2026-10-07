'use client';

// EXP-10 Edit Expense -- docs/ABRO_FRONTEND_SPEC.md §4 (lines 1064-
// 1097). Phase 8 slice 7c: loads the real expense (GET /expenses/{id})
// and saves with PATCH /expenses/{id} (~/lib/expenses-api.ts). Outside
// the (dashboard) route group, matching /expenses/new's focused-flow
// treatment.
//
// Deliberately scoped down from a pre-filled re-run of the 8-step
// wizard. Editable: name, category, amount, date, note, participants
// (toggle on/off). Not editable here: payer, group and split method --
// payer and group are resent unchanged.
//
// Split on save is `editedSplit` (~/lib/expense-split.ts): unchanged
// amount and participants keep the stored amounts exactly; changing
// either recalculates an equal split, with the spec's own warning copy
// ("Changing amount will recalculate all shares" / "Removing
// participants will update balances").
//
// Who can be added mirrors apps/api's prepareWrite (the same rule as
// ~/lib/expense-directory.tsx): your friends for a personal expense,
// the group's ACTIVE members for a group one. Current participants
// always show, even if they no longer qualify, so they can be removed;
// apps/api rejects the save otherwise and its message shows inline.
// If you paid, your own row is locked in, as in EXP-03.
//
// Settlements can't be edited (apps/api's update path can't produce a
// SETTLEMENT -- ADR-003); unknown, deleted or not-visible ids show
// "Expense not found" like EXP-09.

import { ETB, formatMoney, splitEqually, toDecimal } from '@abro/types';
import { EmptyState, PersonRow } from '@abro/ui';
import { ArrowLeft, Receipt } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me } from '~/lib/auth-api';
import { editedSplit, parseAmount } from '~/lib/expense-split';
import { type AuthExpense, getExpense, updateExpense } from '~/lib/expenses-api';
import { listFriends } from '~/lib/friends-api';
import { getGroup } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { CATEGORIES } from '~/lib/reference-data';
import { photoSrc } from '~/lib/photos';

interface EditData {
  profile: AuthProfile;
  expense: AuthExpense;
  /** Current participants first (stored order), then everyone else who
   * may be added. */
  candidates: AuthProfile[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EditData };

async function loadEditData(id: string): Promise<EditData> {
  const [profile, expense] = await Promise.all([me(), getExpense(id)]);
  const pool = expense.groupId
    ? (await getGroup(expense.groupId)).members
        .filter((m) => m.status === 'ACTIVE')
        .map((m) => m.user)
    : [profile, ...(await listFriends()).map((f) => f.friend)];

  const candidates = expense.participants.map((p) => p.user);
  for (const person of pool) {
    if (!candidates.some((c) => c.id === person.id)) {
      candidates.push(person);
    }
  }
  return { profile, expense, candidates };
}

export default function EditExpensePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = () => {
    setState({ status: 'loading' });
    loadEditData(params.id)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err) => {
        if (err instanceof ApiError && [400, 403, 404].includes(err.status)) {
          setState({ status: 'notFound' });
          return;
        }
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load this expense.',
        });
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [params.id]);

  const shell = (children: ReactNode) => (
    <div className="fade-in mx-auto max-w-xl px-5 py-6 md:px-8 md:py-8">{children}</div>
  );

  if (state.status === 'loading') {
    return <LoadingState minHeight="60vh" />;
  }
  if (state.status === 'error') {
    return <ErrorState message={state.message} onRetry={load} minHeight="60vh" />;
  }
  if (state.status === 'notFound' || state.data.expense.splitType === 'SETTLEMENT') {
    const settlement = state.status === 'ready';
    return shell(
      <>
        <button
          onClick={() => router.push(settlement ? `/expenses/${params.id}` : '/activity')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title={settlement ? 'Settlements can’t be edited' : 'Expense not found'}
          description={
            settlement
              ? 'A recorded settlement stays as it is. Delete it and record a new one instead.'
              : "This expense doesn't exist, was deleted, or the link may be out of date."
          }
        />
      </>,
    );
  }

  return shell(<EditForm data={state.data} />);
}

function EditForm({ data }: { data: EditData }) {
  const router = useRouter();
  const { profile, expense, candidates } = data;
  const originalIds = expense.participants.map((p) => p.user.id);

  const [name, setName] = useState(expense.name);
  const [category, setCategory] = useState(expense.category);
  const [amountInput, setAmountInput] = useState(() =>
    toDecimal(BigInt(expense.amount), ETB.decimalDigits).toString(),
  );
  // apps/api stores the date as midnight UTC of the day it was given.
  const [date, setDate] = useState(expense.expenseDate.slice(0, 10));
  const [note, setNote] = useState(expense.notes ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(originalIds);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amount = parseAmount(amountInput);
  const amountChanged = amount !== BigInt(expense.amount);
  const participantsChanged =
    participantIds.length !== originalIds.length ||
    !participantIds.every((id) => originalIds.includes(id));
  const willRecalculate = amountChanged || participantsChanged;
  const isValid =
    name.trim().length > 0 && amount > 0n && date.length > 0 && participantIds.length > 0;
  const iPaid = expense.paidBy.id === profile.id;

  const toggleParticipant = (id: string) => {
    if (id === profile.id && iPaid) {
      return; // locked in -- you paid, so you're always a participant (EXP-03).
    }
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const trimmedNote = note.trim();
    try {
      await updateExpense(expense.id, {
        ...editedSplit(expense, amount, participantIds),
        name: name.trim(),
        category,
        amount: amount.toString(),
        ...(expense.groupId ? { groupId: expense.groupId } : {}),
        paidById: expense.paidBy.id,
        expenseDate: date,
        ...(trimmedNote ? { notes: trimmedNote } : {}),
      });
      router.push(`/expenses/${expense.id}`);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : 'Could not save your changes. Please try again.',
      );
      setSaving(false);
    }
  };

  const preview = willRecalculate && participantIds.length > 0 && amount > 0n;
  const previewShare = preview ? splitEqually(amount, participantIds.length)[0]! : 0n;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/expenses/${expense.id}`)}
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

      <Field label="Expense name">
        <input
          className="neo-input"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          style={{ color: 'var(--t-primary)' }}
        />
      </Field>

      <Field label="Amount">
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
      </Field>

      <Field label="Category">
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
      </Field>

      <Field label="Date">
        <input
          className="neo-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ color: 'var(--t-primary)' }}
        />
      </Field>

      <Field label="Participants">
        <div className="flex flex-col gap-2">
          {candidates.map((p) => {
            const included = participantIds.includes(p.id);
            const locked = p.id === profile.id && iPaid;
            return (
              <PersonRow
                key={p.id}
                initials={initialsOf(p.displayName)}
                color={colorForId(p.id)}
                photo={photoSrc(p.avatarUrl)}
                name={p.id === profile.id ? 'You' : p.displayName}
                right={
                  <span
                    className="text-[0.75rem] font-semibold"
                    style={{ color: included ? 'var(--accent)' : 'var(--t-dim)' }}
                  >
                    {locked ? 'Payer' : included ? 'Included' : 'Add'}
                  </span>
                }
                onClick={() => toggleParticipant(p.id)}
              />
            );
          })}
        </div>
        {participantsChanged && (
          <p className="mt-1.5 pl-1 text-[0.72rem]" style={{ color: 'var(--c-amber)' }}>
            Changing participants will update balances{expense.groupId ? ' in this group' : ''}.
          </p>
        )}
      </Field>

      <Field
        label={
          <>
            Note <span style={{ fontWeight: 400, color: 'var(--t-dim)' }}>(optional)</span>
          </>
        }
      >
        <textarea
          className="neo-input resize-none"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ color: 'var(--t-primary)' }}
        />
      </Field>

      {preview && (
        <div className="neo-inset-sm rounded-[14px] px-3.5 py-3">
          <p className="text-[0.78rem]" style={{ color: 'var(--t-muted)' }}>
            New split: {formatMoney(amount, ETB)} equally among {participantIds.length} participant
            {participantIds.length !== 1 ? 's' : ''} (about {formatMoney(previewShare, ETB)} each).
          </p>
        </div>
      )}

      {saveError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {saveError}
        </p>
      )}

      <button
        onClick={save}
        disabled={!isValid || saving}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Update'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label
        className="mb-2 block pl-1 text-[0.8rem] font-semibold"
        style={{ color: 'var(--t-muted)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
