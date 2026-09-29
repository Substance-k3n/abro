'use client';

// One payment of a group's simplified plan ("A → B, amount"), shared by
// GRP-05's Simplified view and GRP-08. `large` is GRP-08's roomier card
// with a full-width button.
//
// The Settle action opens /settle only when you're the one paying:
// apps/api only lets the debtor record a settlement (ADR-003), so a
// payment owed to you stays disabled with an explanation.

import { ETB, formatMoney } from '@abro/types';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { SimplifiedPayment } from '~/lib/balances-api';
import { type GroupView, PersonAvatar, nameIn } from '~/lib/group-view';

export function PaymentRow({
  view,
  payment,
  large = false,
}: {
  view: GroupView;
  payment: SimplifiedPayment;
  large?: boolean;
}) {
  const youPay = payment.fromUserId === view.profile.id;
  const href = `/settle?groupId=${view.group.id}&toUserId=${payment.toUserId}`;
  const label = large ? 'Mark as Settled' : 'Settle';
  const avatar = large ? 36 : 32;

  const line = (
    <div className="flex items-center gap-2.5">
      <PersonAvatar view={view} userId={payment.fromUserId} size={avatar} />
      <span
        className={large ? 'text-[0.85rem] font-semibold' : 'text-[0.85rem] font-medium'}
        style={{ color: large ? 'var(--t-primary)' : 'var(--t-secondary)' }}
      >
        {nameIn(view, payment.fromUserId, true)}
      </span>
      <ArrowRight size={large ? 16 : 14} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
      <PersonAvatar view={view} userId={payment.toUserId} size={avatar} />
      <span
        className={`flex-1 text-[0.85rem] ${large ? 'font-semibold' : 'font-medium'}`}
        style={{ color: large ? 'var(--t-primary)' : 'var(--t-secondary)' }}
      >
        {nameIn(view, payment.toUserId, true)}
      </span>
      <span
        className={`font-mono font-bold ${large ? 'text-[0.95rem]' : 'mr-1 text-[0.85rem]'}`}
        style={{ color: 'var(--t-primary)' }}
      >
        {formatMoney(payment.amount, ETB)}
      </span>
      {!large && <SettleButton youPay={youPay} href={href} label={label} />}
    </div>
  );

  if (!large) {
    return <div className="neo-raised-sm rounded-2xl px-3.5 py-3">{line}</div>;
  }
  return (
    <div className="neo-raised-sm flex flex-col gap-2.5 rounded-2xl p-4">
      {line}
      <SettleButton youPay={youPay} href={href} label={label} large />
    </div>
  );
}

function SettleButton({
  youPay,
  href,
  label,
  large = false,
}: {
  youPay: boolean;
  href: string;
  label: string;
  large?: boolean;
}) {
  if (youPay) {
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
      title="They need to record this from their side"
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
