'use client';

// STL-03 Settle Up - Confirm -- docs/ABRO_FRONTEND_SPEC.md §6 (lines
// 1641-1677). Phase 8 slice 9b: "Confirm Settlement" calls
// POST /settlements/ (~/lib/settlements-api.ts) with the draft's
// idempotency key, so a retried or double-tapped confirm records the
// payment once.
//
// Deviations:
//  - Payment method and note are gone: apps/api stores neither (user
//    decision 2026-09-29).
//  - Date is a read-only "Today" -- apps/api records a settlement at the
//    time it's made.
//  - The "Important Notice" copy is the spec's own (ABRO_PRD.md §19).
//  - The balance is reloaded here (not trusted from STL-02) so "Balance
//    after" is current; apps/api still has the final say, and its
//    message (e.g. EXCEEDS_OUTSTANDING_DEBT if something changed
//    meanwhile) shows above the buttons.

import { ArrowLeft, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ETB, formatMoney } from '@abro/types';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { parseAmount } from '~/lib/expense-split';
import { type SettleTarget, createSettlement, loadSettleTarget } from '~/lib/settlements-api';
import { useSettleDraft } from '~/lib/settle-draft';

export default function SettleConfirmPage() {
  const router = useRouter();
  const { draft, update } = useSettleDraft();
  const [target, setTarget] = useState<SettleTarget | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amount = parseAmount(draft.amountInput);
  const amountHref = draft.toUserId
    ? `/settle/amount?toUserId=${draft.toUserId}${draft.groupId ? `&groupId=${draft.groupId}` : ''}`
    : '/settle';

  const load = () => {
    setLoadError(null);
    if (!draft.toUserId || amount <= 0n) {
      router.replace('/settle');
      return;
    }
    loadSettleTarget(draft.toUserId, draft.groupId)
      .then((t) => {
        if (!t || amount > t.outstanding) {
          router.replace(amountHref);
          return;
        }
        setTarget(t);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this balance.');
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!target) {
    return <LoadingState />;
  }

  const remaining = target.outstanding - amount;

  const confirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createSettlement(
        {
          toUserId: target.person.id,
          amount: amount.toString(),
          ...(target.group ? { groupId: target.group.id } : {}),
        },
        draft.idempotencyKey,
      );
      update({ recorded: { personName: target.person.displayName, amount } });
      router.push('/settle/success');
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Could not record the settlement. Please try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(amountHref)}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Confirm
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-raised-sm flex flex-col gap-3 rounded-2xl p-4">
        <Row label="Settling with">
          <span className="text-[0.88rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            {target.person.displayName}
          </span>
        </Row>
        {target.group && (
          <Row label="Group">
            <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
              {target.group.name}
            </span>
          </Row>
        )}
        <Row label="Amount">
          <span
            className="font-mono text-[0.95rem] font-bold"
            style={{ color: 'var(--t-primary)' }}
          >
            {formatMoney(amount, ETB)}
          </span>
        </Row>
        <Row label="Direction">
          <span className="text-[0.85rem] font-semibold" style={{ color: 'var(--c-red)' }}>
            You pay
          </span>
        </Row>
        <Row label="Date">
          <span className="text-[0.85rem]" style={{ color: 'var(--t-primary)' }}>
            Today
          </span>
        </Row>
        <Row label="Still to settle after">
          <span
            className="font-mono text-[0.85rem] font-bold"
            style={{ color: remaining === 0n ? 'var(--t-dim)' : 'var(--c-red)' }}
          >
            {remaining === 0n ? 'Nothing' : formatMoney(remaining, ETB)}
          </span>
        </Row>
      </div>

      <div className="neo-inset-sm flex gap-2.5 rounded-2xl p-4">
        <Info
          size={17}
          strokeWidth={2}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent)' }}
        />
        <p className="text-[0.78rem] leading-relaxed" style={{ color: 'var(--t-muted)' }}>
          This records that payment was made. ABRO does not process payments -- make the actual
          payment separately.
        </p>
      </div>

      {submitError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {submitError}
        </p>
      )}

      <div className="flex gap-2.5">
        <button
          onClick={() => router.push('/settle')}
          disabled={submitting}
          className="neo-flat flex-1 rounded-2xl border-none py-3.5 text-[0.9rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={submitting}
          className="neo-btn-green font-display flex-[2] rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:opacity-50"
        >
          {submitting ? 'Recording…' : 'Confirm Settlement'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}
