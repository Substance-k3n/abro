'use client';

// One ekub (ADR-024). What shows depends on where it stands:
// - invited: your turn and amount, with Join / Decline;
// - not started: the turns; the admin invites friends, rearranges and
//   starts it once everyone has joined;
// - running: your turn and what you take, what you still have to pay
//   (with "I paid"), payments into your pot to confirm, and every round
//   with how much of its pot is confirmed. The admin can move turns that
//   are still to come and invite someone mid-way.
// Leaving is at the bottom, with the reason when it isn't allowed yet
// (after the start: once everything into and out of your pot is
// confirmed).

import { SectionLabel } from '@abro/ui';
import { ArrowLeft, Check, Clock, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { AddToTurn, EkubTurns, type TurnShare, amountInput } from '~/components/EkubTurns';
import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import {
  cadenceLabel,
  ekubMoney,
  formatDay,
  isOverdue,
  memberById,
  myPosition,
  roundsOver,
  todayISO,
  turns as turnsOf,
} from '~/lib/ekub-view';
import {
  type EkubDetail,
  type EkubObligation,
  acceptEkub,
  addEkubMember,
  deleteEkub,
  getEkub,
  leaveEkub,
  recordEkubPayment,
  removeEkubMember,
  resolveEkubPayment,
  startEkub,
  updateEkubSlots,
} from '~/lib/ekubs-api';
import { parseAmount } from '~/lib/expense-split';
import { listFriends } from '~/lib/friends-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`neo-raised rounded-[20px] p-4 ${className}`}>{children}</div>;
}

function OverdueTag() {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold uppercase"
      style={{
        color: 'var(--c-red)',
        background: 'color-mix(in srgb, var(--c-red) 12%, transparent)',
      }}
    >
      Overdue
    </span>
  );
}

function toTurnShares(detail: EkubDetail): TurnShare[][] {
  return turnsOf(detail).map((t) =>
    t.map((m) => ({
      id: m.id,
      name: m.displayName,
      amount: amountInput(m.amount),
      note: m.status === 'INVITED' ? 'invited' : undefined,
      joinedRound: m.joinedRound,
    })),
  );
}

export default function EkubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<EkubDetail | null>(null);
  const [friends, setFriends] = useState<{ id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<TurnShare[][] | null>(null);
  const [startDate, setStartDate] = useState(todayISO());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pastPaid, setPastPaid] = useState(true);

  const show = (d: EkubDetail) => {
    setDetail(d);
    setOrder(null);
  };

  const load = () => {
    setLoadError(null);
    getEkub(id)
      .then((d) => {
        show(d);
        if (d.myRole === 'ADMIN') {
          listFriends()
            .then((list) =>
              setFriends(list.map((f) => ({ id: f.friend.id, name: f.friend.displayName }))),
            )
            .catch(() => {});
        }
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this ekub.'),
      );
  };
  useEffect(load, [id]);
  useApiRefresh(load);

  const turnShares = useMemo(() => order ?? (detail ? toTurnShares(detail) : []), [order, detail]);
  const invitable = useMemo(() => {
    const inEkub = new Set(detail?.members.map((m) => m.userId));
    return friends.filter((f) => !inEkub.has(f.id));
  }, [detail, friends]);

  const act = async (fn: () => Promise<EkubDetail | void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result) {
        show(result);
      }
      after?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!detail) {
    return <LoadingState />;
  }

  const money = (a: bigint) => ekubMoney(a, detail);
  const byId = memberById(detail);
  const nameOf = (memberId: string) =>
    memberId === detail.myMemberId ? 'You' : (byId.get(memberId)?.displayName ?? 'Someone');
  const pos = myPosition(detail);
  const isAdmin = detail.myRole === 'ADMIN';
  const invited = detail.myStatus === 'INVITED';
  const running = detail.status === 'ACTIVE';
  const roundCount = detail.rounds.length;
  const current = detail.rounds.find((r) => r.round === detail.currentRound);
  const myRound = pos ? detail.rounds.find((r) => r.round === pos.me.slotPosition) : undefined;
  const orderChanged = order !== null;
  const lockedTurns = running ? Math.max(0, detail.currentRound - 1) : 0;
  const over = startDate ? roundsOver(startDate, detail.cadence, todayISO()) : 0;
  const waitingToJoin = running ? detail.members.filter((m) => m.status === 'INVITED') : [];

  const toPay = (pos?.toPay ?? []).filter((o) => o.status !== 'CONFIRMED');
  const paidCount = (pos?.toPay ?? []).length - toPay.length;
  const toConfirm = (pos?.toReceive ?? []).filter((o) => o.status !== 'CONFIRMED');

  const roundLine = (o: EkubObligation) => {
    const due = detail.rounds.find((r) => r.round === o.round)?.dueDate;
    return `Round ${o.round}${due ? ` · due ${formatDay(due)}` : ''}`;
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <Link
        href="/ekub"
        className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
        style={{ color: 'var(--accent)' }}
      >
        <ArrowLeft size={16} strokeWidth={2} /> Ekub
      </Link>

      <Card className="mb-5">
        <h2
          className="font-display mb-1 text-[1.35rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          {detail.name}
        </h2>
        <p className="text-[0.82rem]" style={{ color: 'var(--t-muted)' }}>
          {money(detail.slotAmount)} a turn, {cadenceLabel(detail.cadence)} · {roundCount} turns ·{' '}
          {detail.memberCount} people
        </p>
        <p className="mt-2 text-[0.85rem] font-semibold" style={{ color: 'var(--accent)' }}>
          {!running
            ? 'Not started yet'
            : current
              ? `Round ${current.round} of ${roundCount} · due ${formatDay(current.dueDate!)}`
              : 'Every round is over'}
        </p>
      </Card>

      {error && (
        <p className="mb-4 text-[0.85rem]" role="alert" style={{ color: 'var(--c-red)' }}>
          {error}
        </p>
      )}

      {invited && pos && (
        <Card className="mb-5">
          <p className="mb-1 text-[0.95rem] font-bold" style={{ color: 'var(--t-primary)' }}>
            You&apos;re invited
          </p>
          <p className="mb-3 text-[0.82rem]" style={{ color: 'var(--t-muted)' }}>
            You&apos;d put in {money(pos.me.amount)} each round
            {running
              ? ', from the round now collecting, with a turn of your own near the end.'
              : ` and take the pot in turn ${pos.me.slotPosition}: ${money(pos.take)}.`}
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() =>
                act(
                  () => leaveEkub(id),
                  () => router.replace('/ekub'),
                )
              }
              className="neo-btn flex-1 rounded-xl py-2.5 text-[0.85rem] font-semibold disabled:opacity-50"
              style={{ color: 'var(--c-red)' }}
            >
              Decline
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => acceptEkub(id))}
              className="neo-btn-green flex-1 rounded-xl py-2.5 text-[0.85rem] font-semibold disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </Card>
      )}

      {running && pos && !invited && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <SectionLabel>Your turn</SectionLabel>
            <p
              className="font-display text-[1.6rem] font-extrabold"
              style={{ color: 'var(--t-primary)' }}
            >
              {money(pos.take)}
            </p>
            <p className="text-[0.8rem]" style={{ color: 'var(--t-muted)' }}>
              Round {pos.me.slotPosition}
              {myRound?.dueDate && ` · ${formatDay(myRound.dueDate)}`} · {money(pos.fromOthers)}{' '}
              from the others + your own {money(pos.me.amount)}
            </p>
            {myRound && (
              <p className="mt-1 text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
                {money(myRound.confirmed)} of {money(myRound.pot)} confirmed
              </p>
            )}
          </Card>

          <Card>
            <SectionLabel>Payments into your pot</SectionLabel>
            {toConfirm.length === 0 ? (
              <p className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
                {pos.toReceive.length === 0 ? 'Nobody pays into your pot.' : 'All confirmed.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {toConfirm.map((o) => (
                  <li key={o.payerMemberId} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[0.88rem] font-medium"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {nameOf(o.payerMemberId)} · {money(o.amount)}
                      </p>
                      <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                        {o.status === 'PENDING' ? 'Says they paid you' : 'Not paid yet'}{' '}
                        {isOverdue(o, detail) && <OverdueTag />}
                      </p>
                    </div>
                    {o.status === 'PENDING' ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => act(() => resolveEkubPayment(id, o.paymentId!, false))}
                          aria-label={`${nameOf(o.payerMemberId)}'s payment didn't arrive`}
                          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-50"
                        >
                          <X size={16} style={{ color: 'var(--c-red)' }} />
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => act(() => resolveEkubPayment(id, o.paymentId!, true))}
                          aria-label={`Confirm ${nameOf(o.payerMemberId)}'s payment`}
                          className="neo-btn-green flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-50"
                        >
                          <Check size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(() => recordEkubPayment(id, o.payerMemberId, 'RECEIVED'))
                        }
                        className="neo-btn rounded-xl px-3 py-2 text-[0.78rem] font-semibold disabled:opacity-50"
                        style={{ color: 'var(--c-green)' }}
                      >
                        Got it
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="md:col-span-2">
            <SectionLabel>You pay</SectionLabel>
            {toPay.length === 0 ? (
              <p className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
                {pos.toPay.length === 0 ? 'Nothing to pay.' : 'All paid and confirmed.'}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {toPay.map((o) => (
                  <li
                    key={o.recipientMemberId}
                    className="neo-inset-sm flex items-center gap-2 rounded-2xl px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[0.88rem] font-medium"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {money(o.amount)} to {nameOf(o.recipientMemberId)}
                      </p>
                      <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                        {roundLine(o)} {isOverdue(o, detail) && <OverdueTag />}
                      </p>
                    </div>
                    {o.status === 'PENDING' ? (
                      <span
                        className="flex items-center gap-1 text-[0.72rem]"
                        style={{ color: 'var(--t-dim)' }}
                      >
                        <Clock size={12} /> Waiting for them
                      </span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(() => recordEkubPayment(id, o.recipientMemberId, 'PAID'))
                        }
                        className="neo-btn-accent rounded-xl px-3 py-2 text-[0.78rem] font-semibold disabled:opacity-50"
                      >
                        I paid
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {paidCount > 0 && (
              <p className="mt-2 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                {paidCount} paid and confirmed.
              </p>
            )}
          </Card>
        </div>
      )}

      {running && (
        <div className="mb-6">
          <SectionLabel>Rounds</SectionLabel>
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {detail.rounds.map((r) => {
              const isCurrent = r.round === detail.currentRound;
              const done = r.pot > 0n && r.confirmed === r.pot;
              const late = r.round < detail.currentRound && !done;
              const payments = detail.obligations.filter((o) => o.round === r.round);
              const pct = r.pot > 0n ? Number((r.confirmed * 100n) / r.pot) : 100;
              return (
                <li
                  key={r.round}
                  className={`rounded-2xl p-3.5 ${isCurrent ? 'neo-raised' : 'neo-flat'}`}
                >
                  <details>
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-[0.75rem] font-bold"
                          style={{ color: 'var(--accent)' }}
                        >
                          {r.round}
                        </span>
                        <p
                          className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold"
                          style={{ color: 'var(--t-primary)' }}
                        >
                          {r.memberIds.map(nameOf).join(' & ')}
                        </p>
                        {isCurrent && (
                          <span
                            className="text-[0.68rem] font-bold uppercase"
                            style={{ color: 'var(--accent)' }}
                          >
                            Now
                          </span>
                        )}
                        {done && <Check size={14} style={{ color: 'var(--c-green)' }} />}
                        {late && <OverdueTag />}
                      </div>
                      <p className="mt-0.5 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                        {r.dueDate && `${formatDay(r.dueDate)} · `}
                        {money(r.confirmed)} of {money(r.pot)} confirmed
                      </p>
                      <div className="neo-inset-sm mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: done ? 'var(--c-green)' : 'var(--accent)',
                          }}
                        />
                      </div>
                    </summary>
                    <ul className="mt-3 flex flex-col gap-1">
                      {payments.map((o) => (
                        <li
                          key={`${o.payerMemberId}-${o.recipientMemberId}`}
                          className="flex items-center justify-between text-[0.75rem]"
                          style={{ color: 'var(--t-muted)' }}
                        >
                          <span className="truncate">
                            {nameOf(o.payerMemberId)} → {nameOf(o.recipientMemberId)} ·{' '}
                            {money(o.amount)}
                          </span>
                          <span
                            style={{
                              color:
                                o.status === 'CONFIRMED'
                                  ? 'var(--c-green)'
                                  : o.status === 'PENDING'
                                    ? 'var(--t-dim)'
                                    : 'var(--c-red)',
                            }}
                          >
                            {o.status === 'CONFIRMED'
                              ? 'Confirmed'
                              : o.status === 'PENDING'
                                ? 'To confirm'
                                : 'Not paid'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(!running || isAdmin) && !invited && (
        <div className="mb-6 flex flex-col gap-3">
          <SectionLabel>{running ? 'Order of turns' : 'Turns'}</SectionLabel>
          {running && isAdmin && (
            <p className="text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
              Turns still to come can change places. Turns that are over stay where they are.
            </p>
          )}
          <EkubTurns
            turns={turnShares}
            onChange={isAdmin ? setOrder : () => {}}
            slotAmount={detail.slotAmount}
            format={money}
            editAmounts={isAdmin && !running}
            lockedTurns={isAdmin ? lockedTurns : roundCount}
            onRemove={
              isAdmin && !running ? (share) => act(() => removeEkubMember(id, share.id)) : undefined
            }
            canRemove={(share) => share.id !== detail.myMemberId}
            highlightId={detail.myMemberId}
            editJoined={isAdmin && !running}
          />
          {isAdmin && orderChanged && (
            <div className="flex gap-2">
              <button
                onClick={() => setOrder(null)}
                className="neo-btn flex-1 rounded-xl py-2.5 text-[0.85rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                Undo
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  act(() =>
                    updateEkubSlots(
                      id,
                      turnShares.map((t) =>
                        t.map((s) => ({
                          id: s.id,
                          amount: parseAmount(s.amount),
                          joinedRound: running ? undefined : s.joinedRound,
                        })),
                      ),
                    ),
                  )
                }
                className="neo-btn-accent flex-1 rounded-xl py-2.5 text-[0.85rem] font-semibold disabled:opacity-50"
              >
                Save turns
              </button>
            </div>
          )}

          {isAdmin && (!running || detail.currentRound <= roundCount) && (
            <>
              <p className="mt-2 text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
                Invite a friend
                {running && (
                  <span className="font-normal" style={{ color: 'var(--t-dim)' }}>
                    {' '}
                    — they put in the full amount from the round now collecting, take the turn you
                    pick (later turns move back when they join), and don&apos;t pay or get paid by
                    anyone whose turn came before.
                  </span>
                )}
              </p>
              <AddToTurn
                people={invitable}
                turnCount={roundCount}
                slotAmount={detail.slotAmount}
                allowShare={!running}
                positionFrom={running ? detail.currentRound : undefined}
                busy={busy}
                onAdd={(userId, turn, part) =>
                  act(() =>
                    addEkubMember(id, {
                      userId,
                      amount: running ? undefined : parseAmount(part),
                      position: turn === null ? undefined : turn + 1,
                    }),
                  )
                }
              />
            </>
          )}
          {waitingToJoin.length > 0 && (
            <p className="text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
              Invited, not joined yet: {waitingToJoin.map((m) => m.displayName).join(', ')}
            </p>
          )}

          {isAdmin && !running && (
            <Card className="mt-2">
              <p className="mb-1 text-[0.9rem] font-bold" style={{ color: 'var(--t-primary)' }}>
                Start the ekub
              </p>
              <p className="mb-3 text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
                Once everyone has joined and every turn adds up. The first pot is due on the day you
                pick, then one every {detail.cadence === 'WEEKLY' ? 'week' : 'month'}. Already
                running? Pick the day it really started, and set above which round any late joiner
                joined in.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="First pot due"
                  className="neo-input sm:w-48"
                />
                <button
                  disabled={busy || !startDate || orderChanged}
                  onClick={() => act(() => startEkub(id, startDate, over > 0 && pastPaid))}
                  className="neo-btn-accent flex-1 rounded-xl py-2.5 text-[0.85rem] font-semibold disabled:opacity-50"
                >
                  Start
                </button>
              </div>
              {over > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <p className="text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
                    {over === 1 ? 'Round 1 is' : `Rounds 1–${Math.min(over, roundCount)} are`}{' '}
                    already over.
                  </p>
                  <label
                    className="flex items-center gap-2 text-[0.8rem]"
                    style={{ color: 'var(--t-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={pastPaid}
                      onChange={(e) => setPastPaid(e.target.checked)}
                    />
                    Everyone paid for those rounds
                  </label>
                  <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                    {pastPaid
                      ? 'They’re recorded as paid, and ABRO tracks from the round now collecting.'
                      : 'Their payments stay open; people record them as usual.'}
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {!invited && (
        <div className="flex flex-col items-center gap-2 pb-4">
          {isAdmin && !running ? (
            <button
              disabled={busy}
              onClick={() =>
                confirmDelete
                  ? act(
                      () => deleteEkub(id),
                      () => router.replace('/ekub'),
                    )
                  : setConfirmDelete(true)
              }
              className="text-[0.82rem] font-semibold disabled:opacity-50"
              style={{ color: 'var(--c-red)' }}
            >
              {confirmDelete ? 'Tap again to delete it for everyone' : 'Delete this ekub'}
            </button>
          ) : (
            !isAdmin && (
              <>
                <button
                  disabled={busy || !detail.canLeave}
                  onClick={() =>
                    act(
                      () => leaveEkub(id),
                      () => router.replace('/ekub'),
                    )
                  }
                  className="neo-btn rounded-xl px-5 py-2.5 text-[0.82rem] font-semibold disabled:opacity-50"
                  style={{ color: 'var(--c-red)' }}
                >
                  Leave this ekub
                </button>
                {detail.leaveBlockedWhy && (
                  <p
                    className="max-w-md text-center text-[0.75rem]"
                    style={{ color: 'var(--t-dim)' }}
                  >
                    {detail.leaveBlockedWhy}
                  </p>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
