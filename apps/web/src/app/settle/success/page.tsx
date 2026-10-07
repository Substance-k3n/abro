'use client';

// STL-04 Settlement Success -- docs/ABRO_FRONTEND_SPEC.md §6 (lines
// 1679-1706).
//
// Folded into this PR alongside STL-02/STL-03 rather than a separate
// one: STL-03's Confirm button is the actual mutation trigger
// (createSettlement), and landing it on a route that doesn't exist yet
// would mean the create flow's one real side effect is unverifiable
// end to end -- same reasoning the expense wizard's Review step always
// pointed at a real destination (expense detail) even while its
// earlier forward links (Payer, Participants) were temporarily dead
// across PR boundaries.
//
// Captures `toUserId`/`groupId` from SettleDraftProvider's `draft` into
// local state ONCE on mount, rather than reading `draft` live on every
// render or threading the settled amount/person through query params.
// This page's own render is deliberately decoupled from the live
// draft: `reset()` (called when leaving, so the next settle flow
// doesn't inherit a stale amount) mutates that same draft,
// and if this page read it live, the reset would immediately null out
// `toUserId` while still mounted and trip the redirect-guard below --
// confirmed by a real repro ("Back to Home" landed back on /settle
// instead of /home). A snapshotted value can't be raced by a reset
// that happens after it was already captured.
//
// "Success animation" (spec's Components list) -- a static check icon,
// not an actual animation; this app has no animation library and a
// CSS-only fade-in (already applied at the wizard layout level) reads
// as "success" well enough without one.

//
// Phase 8 slice 9b: the snapshot is the draft's `recorded` (set by
// STL-03 after apps/api accepted the settlement) plus who/which group;
// the new balance is reloaded from apps/api, not computed here.

import { Clock, Home as HomeIcon, Plus, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ETB, formatMoney } from '@abro/types';

import { loadSettleTarget } from '~/lib/settlements-api';
import { useSettleDraft } from '~/lib/settle-draft';

export default function SettleSuccessPage() {
  const router = useRouter();
  const { draft, reset } = useSettleDraft();
  const [snapshot] = useState(() => ({
    toUserId: draft.toUserId,
    groupId: draft.groupId,
    recorded: draft.recorded,
  }));
  const [remaining, setRemaining] = useState<bigint | null>(null);

  useEffect(() => {
    if (!snapshot.toUserId || !snapshot.recorded) {
      router.replace('/settle');
      return;
    }
    loadSettleTarget(snapshot.toUserId, snapshot.groupId)
      .then((t) => setRemaining(t?.outstanding ?? 0n))
      .catch(() => setRemaining(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!snapshot.toUserId || !snapshot.recorded) {
    return null;
  }

  const { personName, amount, receiptFailed } = snapshot.recorded;
  const firstName = personName.split(' ')[0];

  const goTo = (path: string) => {
    reset();
    router.push(path);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
      >
        <Clock size={34} strokeWidth={2} />
      </div>

      <div>
        <h2
          className="font-display mb-1 text-[1.3rem] font-extrabold tracking-tight"
          style={{ color: 'var(--t-primary)' }}
        >
          Sent to {firstName}
        </h2>
        <p className="text-[0.85rem]" style={{ color: 'var(--t-dim)' }}>
          Your payment of {formatMoney(amount, ETB)} is waiting for {firstName} to confirm it. Your
          balance changes once they do.
        </p>
        {receiptFailed && (
          <p className="mt-2 text-[0.8rem]" style={{ color: 'var(--c-red)' }}>
            The photo didn&apos;t upload. You can add it from Payments.
          </p>
        )}
      </div>

      <div className="neo-raised-sm w-full rounded-2xl p-4 text-left">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
            With
          </span>
          <span className="text-[0.88rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            {personName}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
            Still to settle until confirmed
          </span>
          <span
            className="font-mono text-[0.9rem] font-bold"
            style={{ color: remaining ? 'var(--c-red)' : 'var(--t-dim)' }}
          >
            {remaining === null ? '…' : remaining === 0n ? 'Nothing' : formatMoney(remaining, ETB)}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <button
          onClick={() => goTo('/payments')}
          className="neo-btn flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[0.85rem] font-medium"
          style={{ color: 'var(--t-secondary)' }}
        >
          <Receipt size={17} strokeWidth={1.9} /> View payments
        </button>
        <button
          onClick={() => goTo('/expenses/new')}
          className="neo-btn flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[0.85rem] font-medium"
          style={{ color: 'var(--t-secondary)' }}
        >
          <Plus size={17} strokeWidth={1.9} /> Add another expense
        </button>
        <button
          onClick={() => goTo('/home')}
          className="neo-btn-accent font-display flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
        >
          <HomeIcon size={17} strokeWidth={2} /> Back to Home
        </button>
      </div>
    </div>
  );
}
