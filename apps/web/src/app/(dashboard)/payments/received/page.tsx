'use client';

// "They paid me" (ADR-019): the person who was paid records a payment
// themselves -- e.g. cash in hand. It counts at once (POST
// /settlements/received), with no confirm step, since they're the one
// who would lose out if it were wrong. The payer is notified.
// /payments/received?fromUserId=…[&groupId=…], opened from Friend Detail
// (when they owe you) and from a group's suggested payment to you.
// The amount starts at everything they owe and can be lowered for a
// part-payment; apps/api checks it again.

import { ETB, formatMoney } from '@abro/types';
import { Avatar } from '@abro/ui';
import { ArrowLeft, Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { parseAmount } from '~/lib/expense-split';
import { colorForId, initialsOf } from '~/lib/identity';
import { photoSrc } from '~/lib/photos';
import { type SettleTarget, loadReceiveTarget, recordReceived } from '~/lib/settlements-api';

export default function RecordReceivedPage() {
  return (
    <Suspense>
      <RecordReceived />
    </Suspense>
  );
}

function toInput(amount: bigint): string {
  return (Number(amount) / 100).toFixed(2);
}

function RecordReceived() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUserId = searchParams.get('fromUserId');
  const groupId = searchParams.get('groupId');

  const [target, setTarget] = useState<SettleTarget | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<bigint | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const load = () => {
    setLoadError(null);
    if (!fromUserId) {
      setTarget(null);
      return;
    }
    loadReceiveTarget(fromUserId, groupId)
      .then((t) => {
        setTarget(t);
        if (t && t.outstanding > 0n) {
          setAmountInput(toInput(t.outstanding));
        }
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this balance.'),
      );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [fromUserId, groupId]);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (target === undefined) {
    return <LoadingState />;
  }

  const back = (
    <button
      onClick={() => router.back()}
      className="mb-5 flex items-center gap-1 text-[0.85rem] font-medium"
      style={{ color: 'var(--accent)' }}
    >
      <ArrowLeft size={16} strokeWidth={2} /> Back
    </button>
  );

  if (!target || target.outstanding <= 0n) {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-md md:px-8 md:py-8">
        {back}
        <p className="text-[0.9rem]" style={{ color: 'var(--t-muted)' }}>
          {target
            ? `${target.person.displayName} doesn't owe you anything`
            : 'Nothing to record here'}
          {target?.group ? ` in ${target.group.name}` : ''}.
        </p>
      </div>
    );
  }

  const first = target.person.displayName.split(' ')[0];
  const amount = parseAmount(amountInput);
  const tooMuch = amount > target.outstanding;

  if (done !== null) {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-md md:px-8 md:py-8">
        <h2
          className="font-display mb-2 text-[1.3rem] font-extrabold"
          style={{ color: 'var(--t-primary)' }}
        >
          Payment recorded
        </h2>
        <p className="mb-6 text-[0.88rem]" style={{ color: 'var(--t-muted)' }}>
          {first} paid you {formatMoney(done, ETB)}. Your balances are updated and {first} has been
          told.
        </p>
        <button
          onClick={() => router.back()}
          className="neo-btn-accent font-display w-full rounded-2xl py-3.5 text-[0.95rem] font-semibold"
        >
          Done
        </button>
      </div>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await recordReceived(
        {
          fromUserId: target.person.id,
          amount: amount.toString(),
          ...(target.group ? { groupId: target.group.id } : {}),
        },
        idempotencyKey,
      );
      setDone(amount);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not record the payment.');
    }
    setSubmitting(false);
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-md md:px-8 md:py-8">
      {back}
      <h2
        className="font-display mb-4 text-[1.3rem] font-extrabold"
        style={{ color: 'var(--t-primary)' }}
      >
        {first} paid me
      </h2>

      <div className="neo-raised-sm mb-4 flex items-center gap-3 rounded-2xl p-4">
        <Avatar
          initials={initialsOf(target.person.displayName)}
          color={colorForId(target.person.id)}
          size={42}
          src={photoSrc(target.person.avatarUrl)}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            {target.person.displayName}
          </p>
          <p className="text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
            owes you {formatMoney(target.outstanding, ETB)}
            {target.group ? ` in ${target.group.name}` : ''}
          </p>
        </div>
      </div>

      <label className="mb-1.5 block text-[0.8rem] font-medium" style={{ color: 'var(--t-muted)' }}>
        How much did they pay you?
      </label>
      <input
        className="neo-input mb-2 font-mono text-[1.2rem] font-bold"
        inputMode="decimal"
        value={amountInput}
        onChange={(e) => setAmountInput(e.target.value)}
        aria-invalid={tooMuch}
      />
      {tooMuch && (
        <p className="mb-2 text-[0.78rem]" style={{ color: 'var(--c-red)' }}>
          That&apos;s more than {first} owes you ({formatMoney(target.outstanding, ETB)}).
        </p>
      )}

      <div className="neo-inset-sm my-4 flex gap-2.5 rounded-2xl p-4">
        <Info
          size={17}
          strokeWidth={2}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent)' }}
        />
        <p className="text-[0.78rem] leading-relaxed" style={{ color: 'var(--t-muted)' }}>
          Because you&apos;re the one who received it, this counts straight away -- no confirm step.
          {amount > 0n && amount < target.outstanding
            ? ` ${first} will still owe you ${formatMoney(target.outstanding - amount, ETB)}.`
            : ''}
        </p>
      </div>

      {submitError && (
        <p
          role="alert"
          className="mb-3 rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {submitError}
        </p>
      )}

      <button
        onClick={submit}
        disabled={submitting || amount <= 0n || tooMuch}
        className="neo-btn-green font-display w-full rounded-2xl py-3.5 text-[0.95rem] font-semibold disabled:opacity-50"
      >
        {submitting ? 'Recording…' : `Record ${amount > 0n ? formatMoney(amount, ETB) : 'payment'}`}
      </button>
    </div>
  );
}
