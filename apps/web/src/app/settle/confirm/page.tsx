'use client';

// STL-03 Settle Up - Confirm -- docs/ABRO_FRONTEND_SPEC.md §6 (lines
// 1641-1677). Phase 8 slice 9b: "Confirm Settlement" calls
// POST /settlements/ (~/lib/settlements-api.ts) with the draft's
// idempotency key, so a retried or double-tapped confirm records the
// payment once.
//
// ADR-019: this sends the payment for the other person to confirm; it
// changes no balance until they do. An optional receipt photo (transfer
// screenshot, receipt) is uploaded right after, for them to see first.
// If only the photo fails, the payment is still sent and the success
// screen says the photo didn't go through.
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

import { ArrowLeft, ImagePlus, Info, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ETB, formatMoney } from '@abro/types';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from '~/lib/expenses-api';
import { parseAmount } from '~/lib/expense-split';
import {
  type SettleTarget,
  createSettlement,
  loadSettleTarget,
  uploadSettlementReceipt,
} from '~/lib/settlements-api';
import { useSettleDraft } from '~/lib/settle-draft';

export default function SettleConfirmPage() {
  const router = useRouter();
  const { draft, update } = useSettleDraft();
  const [target, setTarget] = useState<SettleTarget | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

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
      const request = await createSettlement(
        {
          toUserId: target.person.id,
          amount: amount.toString(),
          ...(target.group ? { groupId: target.group.id } : {}),
        },
        draft.idempotencyKey,
      );
      let receiptFailed = false;
      if (receipt) {
        await uploadSettlementReceipt(request.id, receipt).catch(() => {
          receiptFailed = true;
        });
      }
      update({ recorded: { personName: target.person.displayName, amount, receiptFailed } });
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
        <Row label="Still to settle once confirmed">
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
          {target.person.displayName.split(' ')[0]} will be asked to confirm they received it. Your
          balance changes once they do. ABRO doesn&apos;t move money -- pay them separately.
        </p>
      </div>

      <div className="neo-raised-sm flex items-center gap-3 rounded-2xl px-4 py-3">
        <ImagePlus size={18} strokeWidth={2} style={{ color: 'var(--accent)' }} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            Proof of payment
          </p>
          <p className="truncate text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
            {receipt ? receipt.name : 'Optional: a transfer screenshot or receipt'}
          </p>
        </div>
        {receipt ? (
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => setReceipt(null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ color: 'var(--t-dim)' }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        ) : (
          <label
            className="neo-btn cursor-pointer rounded-xl px-3 py-2 text-[0.78rem] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            Add photo
            <input
              type="file"
              accept={RECEIPT_TYPES.join(',')}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                setReceiptError(null);
                if (!file) {
                  return;
                }
                if (!RECEIPT_TYPES.includes(file.type)) {
                  setReceiptError('Photos must be JPG, PNG or WebP.');
                  return;
                }
                if (file.size > RECEIPT_MAX_BYTES) {
                  setReceiptError('Photos must be 10 MB or smaller.');
                  return;
                }
                setReceipt(file);
              }}
            />
          </label>
        )}
      </div>
      {receiptError && (
        <p role="alert" className="text-[0.78rem]" style={{ color: 'var(--c-red)' }}>
          {receiptError}
        </p>
      )}

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
          {submitting ? 'Sending…' : 'Send for confirmation'}
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
