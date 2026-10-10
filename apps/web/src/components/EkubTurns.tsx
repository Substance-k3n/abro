'use client';

// The ekub turn list (ADR-024): turns in payout order, each one person
// or several sharing it, with their parts. Used to set up a new ekub and
// to rearrange one before or after it starts. Moving a turn up or down
// changes the round it takes the pot; the parts of a turn must add up to
// the amount per turn (shown under each turn, and checked by the API).

import { Avatar } from '@abro/ui';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';

import { parseAmount } from '~/lib/expense-split';
import { colorForId, initialsOf } from '~/lib/identity';

export interface TurnShare {
  /** A user id while creating, a member id afterwards. */
  id: string;
  name: string;
  /** Decimal string as typed, e.g. "20000". */
  amount: string;
  /** A short tag after the name, e.g. "invited". */
  note?: string;
}

/** Minor units as a plain decimal string for an amount input. */
export function amountInput(minor: bigint): string {
  const whole = minor / 100n;
  const cents = minor % 100n;
  return cents === 0n ? whole.toString() : `${whole}.${cents.toString().padStart(2, '0')}`;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function EkubTurns({
  turns,
  onChange,
  slotAmount,
  format,
  editAmounts,
  lockedTurns = 0,
  onRemove,
  canRemove = () => true,
  highlightId,
}: {
  turns: TurnShare[][];
  onChange: (turns: TurnShare[][]) => void;
  slotAmount: bigint;
  format: (amount: bigint) => string;
  /** Before the start, parts can change; after it they're fixed. */
  editAmounts: boolean;
  /** Turns already over (from the top): they can't move. */
  lockedTurns?: number;
  onRemove?: (share: TurnShare, turn: number) => void;
  canRemove?: (share: TurnShare) => boolean;
  /** The viewer, shown as "You". */
  highlightId?: string;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {turns.map((turn, i) => {
        const sum = turn.reduce((total, s) => total + parseAmount(s.amount), 0n);
        const locked = i < lockedTurns;
        const canUp = !locked && i > lockedTurns;
        const canDown = !locked && i < turns.length - 1;
        return (
          <li key={turn.map((s) => s.id).join('+')} className="neo-raised rounded-2xl p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="neo-inset-sm flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[0.75rem] font-bold"
                style={{ color: 'var(--accent)' }}
              >
                {i + 1}
              </span>
              <p className="flex-1 text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
                Turn {i + 1}
                {turn.length > 1 && ' · shared'}
                {locked && ' · over'}
              </p>
              {!locked && (
                <>
                  <button
                    type="button"
                    onClick={() => onChange(move(turns, i, i - 1))}
                    disabled={!canUp}
                    aria-label={`Move turn ${i + 1} earlier`}
                    className="neo-btn flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-30"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(move(turns, i, i + 1))}
                    disabled={!canDown}
                    aria-label={`Move turn ${i + 1} later`}
                    className="neo-btn flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-30"
                  >
                    <ChevronDown size={16} />
                  </button>
                </>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {turn.map((share) => (
                <li key={share.id} className="flex items-center gap-2.5">
                  <Avatar
                    initials={initialsOf(share.name)}
                    color={colorForId(share.id)}
                    size={32}
                  />
                  <p
                    className="min-w-0 flex-1 truncate text-[0.88rem] font-medium"
                    style={{ color: 'var(--t-primary)' }}
                  >
                    {share.id === highlightId ? 'You' : share.name}
                    {share.note && (
                      <span className="ml-1.5 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                        {share.note}
                      </span>
                    )}
                  </p>
                  {editAmounts && turn.length > 1 ? (
                    <input
                      inputMode="decimal"
                      value={share.amount}
                      aria-label={`${share.name}'s part`}
                      onChange={(e) =>
                        onChange(
                          turns.map((t, ti) =>
                            ti === i
                              ? t.map((s) =>
                                  s.id === share.id ? { ...s, amount: e.target.value } : s,
                                )
                              : t,
                          ),
                        )
                      }
                      className="neo-input w-28 py-1.5 text-right font-mono text-[0.85rem]"
                    />
                  ) : (
                    <span
                      className="font-mono text-[0.82rem]"
                      style={{ color: 'var(--t-secondary)' }}
                    >
                      {format(parseAmount(share.amount))}
                    </span>
                  )}
                  {onRemove && !locked && canRemove(share) && (
                    <button
                      type="button"
                      onClick={() => onRemove(share, i)}
                      aria-label={`Take ${share.name} out`}
                      className="neo-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    >
                      <X size={14} style={{ color: 'var(--c-red)' }} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {sum !== slotAmount && (
              <p className="mt-2 text-[0.75rem]" role="alert" style={{ color: 'var(--c-red)' }}>
                Adds up to {format(sum)}; a turn is {format(slotAmount)}.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Pick a friend and the turn they go in: a new turn of their own, or
 * sharing one already there. */
export function AddToTurn({
  people,
  turnCount,
  slotAmount,
  allowShare,
  busy,
  onAdd,
}: {
  people: { id: string; name: string }[];
  turnCount: number;
  slotAmount: bigint;
  /** Only before the start can someone share a turn. */
  allowShare: boolean;
  busy?: boolean;
  /** turn: 0-based index of the turn to share, or null for a new one. */
  onAdd: (personId: string, turn: number | null, amount: string) => void;
}) {
  const [personId, setPersonId] = useState('');
  const [turn, setTurn] = useState<string>('new');
  const [amount, setAmount] = useState(amountInput(slotAmount));
  const sharing = turn !== 'new';

  if (people.length === 0) {
    return (
      <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
        Everyone on your friends list is already in. Add more friends to invite them.
      </p>
    );
  }

  return (
    <div className="neo-inset-sm flex flex-col gap-2.5 rounded-2xl p-3.5">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          aria-label="Friend"
          className="neo-input flex-1"
        >
          <option value="">Choose a friend…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {allowShare && (
          <select
            value={turn}
            onChange={(e) => {
              setTurn(e.target.value);
              setAmount(amountInput(e.target.value === 'new' ? slotAmount : slotAmount / 2n));
            }}
            aria-label="Turn"
            className="neo-input sm:w-44"
          >
            <option value="new">A turn of their own</option>
            {Array.from({ length: turnCount }, (_, i) => (
              <option key={i} value={String(i)}>
                Share turn {i + 1}
              </option>
            ))}
          </select>
        )}
      </div>
      {allowShare && sharing && (
        <label
          className="flex items-center gap-2 text-[0.8rem]"
          style={{ color: 'var(--t-muted)' }}
        >
          Their part
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="neo-input w-32 py-1.5 text-right font-mono"
          />
          <span style={{ color: 'var(--t-dim)' }}>(change the others&apos; parts to match)</span>
        </label>
      )}
      <button
        type="button"
        disabled={!personId || busy || (sharing && parseAmount(amount) <= 0n)}
        onClick={() => {
          onAdd(
            personId,
            sharing ? Number(turn) : null,
            sharing ? amount : amountInput(slotAmount),
          );
          setPersonId('');
          setTurn('new');
          setAmount(amountInput(slotAmount));
        }}
        className="neo-btn-accent rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}
