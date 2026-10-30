'use client';

// One payment of a group's simplified plan ("A → B, amount"), shared by
// GRP-05's Simplified view and GRP-08. `large` is GRP-08's roomier card
// with a full-width button.
//
// The action opens /settle when you're the one paying (it then waits for
// them to confirm, ADR-019), and "They paid me" (/payments/received)
// when the payment is to you -- you can record it yourself, and it counts
// at once. A payment between two other members has no action for you.
//
// `raw` is a row of GRP-05's "Who owes whom" list: the action passes the
// row's amount along as the suggested figure, and is disabled when the
// group-net rule (ADR-010) wouldn't allow it -- the payer no longer owes
// the group, or the receiver is no longer owed (after earlier payments
// that went the simplified way).

import { ETB, formatMoney } from '@abro/types';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { SimplifiedPayment } from '~/lib/balances-api';
import { type GroupView, PersonAvatar, nameIn } from '~/lib/group-view';

export function PaymentRow({
  view,
  payment,
  large = false,
  raw = false,
}: {
  view: GroupView;
  payment: SimplifiedPayment;
  large?: boolean;
  raw?: boolean;
}) {
  const youPay = payment.fromUserId === view.profile.id;
  const youReceive = payment.toUserId === view.profile.id;
  const payable =
    !raw ||
    ((view.nets.get(payment.fromUserId) ?? 0n) < 0n &&
      (view.nets.get(payment.toUserId) ?? 0n) > 0n);
  const suggested = raw ? `&amount=${payment.amount}` : '';
  const href = youPay
    ? `/settle?groupId=${view.group.id}&toUserId=${payment.toUserId}${suggested}`
    : `/payments/received?groupId=${view.group.id}&fromUserId=${payment.fromUserId}${suggested}`;
  const enabled = (youPay || youReceive) && payable;
  const disabledTitle = payable
    ? 'Only the two people in this payment can record it'
    : 'Their group totals are already even -- see the Individual tab';
  const label = youReceive
    ? large
      ? 'They paid me'
      : 'Received'
    : large
      ? 'Mark as Settled'
      : 'Settle';
  const avatar = large ? 36 : 32;

  if (!large) {
    // Compact: the two avatars overlap and the amount sits under the
    // names, so a phone-width row never squeezes a name or the button.
    return (
      <div className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3">
        <div className="flex shrink-0">
          <PersonAvatar view={view} userId={payment.fromUserId} size={avatar} />
          <div className="-ml-2.5">
            <PersonAvatar view={view} userId={payment.toUserId} size={avatar} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 text-[0.85rem] font-medium"
            style={{ color: 'var(--t-secondary)' }}
          >
            <span className="truncate">{nameIn(view, payment.fromUserId, true)}</span>
            <ArrowRight
              size={13}
              strokeWidth={2}
              className="shrink-0"
              style={{ color: 'var(--t-dim)' }}
            />
            <span className="truncate">{nameIn(view, payment.toUserId, true)}</span>
          </div>
          <div
            className="whitespace-nowrap font-mono text-[0.85rem] font-bold"
            style={{ color: 'var(--t-primary)' }}
          >
            {formatMoney(payment.amount, ETB)}
          </div>
        </div>
        <SettleButton enabled={enabled} href={href} label={label} title={disabledTitle} />
      </div>
    );
  }

  const line = (
    <div className="flex items-center gap-2.5">
      <PersonAvatar view={view} userId={payment.fromUserId} size={avatar} />
      <span className="text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
        {nameIn(view, payment.fromUserId, true)}
      </span>
      <ArrowRight
        size={16}
        strokeWidth={2}
        className="shrink-0"
        style={{ color: 'var(--t-dim)' }}
      />
      <PersonAvatar view={view} userId={payment.toUserId} size={avatar} />
      <span className="flex-1 text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
        {nameIn(view, payment.toUserId, true)}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[0.95rem] font-bold"
        style={{ color: 'var(--t-primary)' }}
      >
        {formatMoney(payment.amount, ETB)}
      </span>
    </div>
  );

  return (
    <div className="neo-raised-sm flex flex-col gap-2.5 rounded-2xl p-4">
      {line}
      <SettleButton enabled={enabled} href={href} label={label} title={disabledTitle} large />
    </div>
  );
}

function SettleButton({
  enabled,
  href,
  label,
  title,
  large = false,
}: {
  enabled: boolean;
  href: string;
  label: string;
  title: string;
  large?: boolean;
}) {
  if (enabled) {
    return (
      <Link
        href={href}
        className={
          large
            ? 'neo-btn-green rounded-xl py-2 text-center text-[0.78rem] font-semibold'
            : 'neo-btn shrink-0 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold'
        }
      >
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled
      title={title}
      className={
        large
          ? 'neo-flat cursor-not-allowed rounded-xl py-2 text-[0.78rem] font-semibold opacity-50'
          : 'neo-flat shrink-0 cursor-not-allowed rounded-lg px-2.5 py-1.5 text-[0.72rem] font-medium opacity-50'
      }
      style={{ color: large ? 'var(--c-green)' : 'var(--t-muted)' }}
    >
      {label}
    </button>
  );
}
