'use client';

// Expense disputes on EXP-09 (ADR-020, phone-trial feedback): someone
// added to an expense they weren't part of can say so. It changes no
// amount -- it flags their share and tells the payer, who either edits
// the expense (which clears it) or keeps it as it is (they're told).
//
// Shows, for this viewer:
//  - each open dispute, with "Edit expense" / "Keep as is" for whoever
//    may edit it (payer; group admins too, which apps/api checks), and
//    "Take it back" on your own;
//  - "I wasn't part of this" when you have a share and didn't pay.

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ApiError } from '~/lib/api-client';
import type { AuthProfile } from '~/lib/auth-api';
import {
  type AuthExpense,
  dismissDispute,
  disputeExpense,
  withdrawDispute,
} from '~/lib/expenses-api';

export function DisputeSection({
  expense,
  me,
  mightManage,
  onChange,
}: {
  expense: AuthExpense;
  me: AuthProfile;
  /** The payer, or anyone in the expense's group (apps/api decides). */
  mightManage: boolean;
  onChange: (updated: AuthExpense) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  if (expense.splitType === 'SETTLEMENT' || expense.deletedAt) {
    return null;
  }

  const disputed = expense.participants.filter((p) => p.disputedAt);
  const mine = expense.participants.find((p) => p.user.id === me.id);
  const canDispute =
    mine && BigInt(mine.amount) > 0n && !mine.disputedAt && expense.paidBy.id !== me.id;

  const run = async (key: string, action: () => Promise<AuthExpense>) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await action());
      setAsking(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
    setBusy(null);
  };

  if (disputed.length === 0 && !canDispute) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col gap-3">
      {disputed.map((p) => {
        const isMe = p.user.id === me.id;
        return (
          <div
            key={p.id}
            className="flex flex-col gap-3 rounded-[18px] p-4"
            style={{ background: 'var(--red-bg)' }}
          >
            <div className="flex gap-2.5">
              <AlertTriangle
                size={18}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--c-amber)' }}
              />
              <p className="text-[0.84rem]" style={{ color: 'var(--t-primary)' }}>
                {isMe ? (
                  <>
                    You said you weren&apos;t part of this.{' '}
                    {expense.paidBy.displayName.split(' ')[0]} has been told. Your share still
                    counts until they edit it.
                  </>
                ) : (
                  <>
                    <strong>{p.user.displayName}</strong> says they weren&apos;t part of this. Their
                    share still counts until the expense is edited.
                  </>
                )}
              </p>
            </div>
            {isMe ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run(`withdraw:${p.id}`, () => withdrawDispute(expense.id))}
                className="neo-btn self-start rounded-xl px-3.5 py-2 text-[0.8rem] font-semibold"
                style={{ color: 'var(--t-secondary)' }}
              >
                {busy === `withdraw:${p.id}` ? 'Saving…' : 'Take it back'}
              </button>
            ) : (
              mightManage && (
                <div className="flex gap-2">
                  <Link
                    href={`/expenses/${expense.id}/edit`}
                    className="neo-btn-accent flex-1 rounded-xl py-2 text-center text-[0.8rem] font-semibold"
                  >
                    Edit expense
                  </Link>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      run(`dismiss:${p.id}`, () => dismissDispute(expense.id, p.user.id))
                    }
                    className="neo-btn flex-1 rounded-xl py-2 text-[0.8rem] font-semibold"
                    style={{ color: 'var(--t-secondary)' }}
                  >
                    {busy === `dismiss:${p.id}` ? 'Saving…' : 'Keep as is'}
                  </button>
                </div>
              )
            )}
          </div>
        );
      })}

      {canDispute &&
        (asking ? (
          <div className="neo-raised-sm flex flex-col gap-3 rounded-[18px] p-4">
            <p className="text-[0.84rem]" style={{ color: 'var(--t-primary)' }}>
              Tell {expense.paidBy.displayName.split(' ')[0]} you weren&apos;t part of{' '}
              <strong>{expense.name}</strong>? Nothing changes until they edit it.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAsking(false)}
                disabled={busy !== null}
                className="neo-btn flex-1 rounded-xl py-2 text-[0.8rem] font-semibold"
                style={{ color: 'var(--t-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('dispute', () => disputeExpense(expense.id))}
                className="flex-1 rounded-xl py-2 text-[0.8rem] font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--c-red)' }}
              >
                {busy === 'dispute' ? 'Sending…' : "I wasn't part of this"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAsking(true);
            }}
            className="self-center text-[0.8rem] font-medium"
            style={{ color: 'var(--c-red)' }}
          >
            I wasn&apos;t part of this
          </button>
        ))}

      {error && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
