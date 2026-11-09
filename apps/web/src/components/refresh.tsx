'use client';

// The UI refresh's building blocks (prototype 2026-11-05, Home and Group
// first). Same soft 3D language, used with more restraint:
//  - Panel: ONE raised surface per list; its rows are split by a hairline
//    instead of each being its own raised card.
//  - Amount: money in the display face with aligned digits and a small
//    "ETB"; owed/owe in calm colours, always with a word beside them.
//  - SectionHeader: sentence case, no all-caps labels.
//  - HeroBalance: the purple card with a big figure, a plain-words label
//    and two tappable tiles -- and one calm "All settled" moment at zero.

import { ETB, type MinorUnits, toDecimal } from '@abro/types';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export type Tone = 'owed' | 'owe' | 'plain';

const TONE_COLOR: Record<Tone, string> = {
  owed: 'var(--owed)',
  owe: 'var(--owe)',
  plain: 'var(--t-primary)',
};

const SIZES = {
  sm: { num: 'text-[0.95rem]', cur: 'text-[0.68rem]' },
  md: { num: 'text-[1.1rem]', cur: 'text-[0.72rem]' },
  lg: { num: 'text-[1.6rem]', cur: 'text-[0.8rem]' },
  xl: { num: 'text-[2.75rem] leading-none', cur: 'text-[1rem]' },
} as const;

function digits(value: MinorUnits): string {
  const abs = value < 0n ? -value : value;
  return toDecimal(abs, ETB.decimalDigits).toLocaleString('en-US', {
    minimumFractionDigits: ETB.decimalDigits,
    maximumFractionDigits: ETB.decimalDigits,
  });
}

/** An amount of money: the number, then a small "ETB". `value` may be
 * signed; only its size is shown -- the tone and the words around it say
 * which way it goes. */
export function Amount({
  value,
  tone = 'plain',
  size = 'sm',
  color,
}: {
  value: MinorUnits;
  tone?: Tone;
  size?: keyof typeof SIZES;
  color?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      className="figure inline-flex items-baseline gap-1 whitespace-nowrap"
      style={{ color: color ?? TONE_COLOR[tone] }}
    >
      <span className={`${s.num} font-semibold`}>{digits(value)}</span>
      <span className={`${s.cur} font-medium opacity-70`}>{ETB.code}</span>
    </span>
  );
}

export function SectionHeader({
  title,
  href,
  link = 'See all',
}: {
  title: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between px-1">
      <h3
        className="font-display text-[1.02rem] font-semibold"
        style={{ color: 'var(--t-primary)' }}
      >
        {title}
      </h3>
      {href && (
        <Link href={href} className="text-[0.8rem] font-medium" style={{ color: 'var(--accent)' }}>
          {link}
        </Link>
      )}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`neo-raised overflow-hidden rounded-[22px] ${className}`}>{children}</div>;
}

/** One row of a Panel: leading visual, a title with a sub line, and
 * whatever sits on the right. A link or button when it goes somewhere. */
export function Row({
  href,
  onClick,
  leading,
  title,
  sub,
  subTone,
  trailing,
  trailingSub,
  chevron = false,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  subTone?: Tone;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  chevron?: boolean;
}) {
  const body = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[0.92rem] font-semibold"
          style={{ color: 'var(--t-primary)' }}
        >
          {title}
        </span>
        {sub && (
          <span
            className="mt-0.5 block truncate text-[0.76rem]"
            style={{ color: subTone && subTone !== 'plain' ? TONE_COLOR[subTone] : 'var(--t-dim)' }}
          >
            {sub}
          </span>
        )}
      </span>
      {(trailing || trailingSub) && (
        <span className="flex shrink-0 flex-col items-end">
          {trailing}
          {trailingSub && (
            <span className="mt-0.5 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
              {trailingSub}
            </span>
          )}
        </span>
      )}
      {chevron && (
        <ChevronRight
          size={16}
          strokeWidth={2}
          className="shrink-0"
          style={{ color: 'var(--t-dim)' }}
        />
      )}
    </>
  );
  const cls = 'panel-row flex w-full items-center gap-3 px-4 py-3.5 text-left';
  if (href) {
    return (
      <Link href={href} className={`${cls} transition-colors active:bg-black/[0.03]`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} border-none bg-transparent transition-colors active:bg-black/[0.03]`}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** A soft square holding an icon or picture at the start of a row. */
export function Tile({
  children,
  tint,
  color,
  size = 40,
}: {
  children: ReactNode;
  tint?: string;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="relative flex items-center justify-center overflow-hidden rounded-[13px]"
      style={{
        width: size,
        height: size,
        background: tint ?? 'var(--neo-bg2)',
        color: color ?? 'var(--t-muted)',
      }}
    >
      {children}
    </span>
  );
}

/** Home's balance: the one bold element on the screen. */
export function HeroBalance({
  net,
  owedTotal,
  oweTotal,
  onOwed,
  onOwe,
}: {
  net: MinorUnits;
  owedTotal: MinorUnits;
  oweTotal: MinorUnits;
  onOwed: () => void;
  onOwe: () => void;
}) {
  const settled = net === 0n && owedTotal === 0n && oweTotal === 0n;
  const total = owedTotal + oweTotal;
  const owedPct = total > 0n ? Number((owedTotal * 1000n) / total) / 10 : 50;
  return (
    <section className="neo-card-accent rounded-[28px] p-6 text-white" aria-label="Your balance">
      {settled ? (
        <div className="hero-settled flex items-center gap-3 py-3">
          <CheckCircle2 size={34} strokeWidth={1.8} aria-hidden />
          <div>
            <p className="font-display text-[1.6rem] font-semibold leading-tight">All settled</p>
            <p className="text-[0.85rem] opacity-80">No one owes anyone right now.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[0.85rem] opacity-80">
            {net > 0n
              ? "Overall, you're owed"
              : net < 0n
                ? 'Overall, you owe'
                : "Overall, you're even"}
          </p>
          <p className="mt-2">
            <Amount value={net} size="xl" color="#fff" />
          </p>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/20" aria-hidden>
            <div className="h-full rounded-full bg-white/85" style={{ width: `${owedPct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <HeroTile label="Owed to you" value={owedTotal} onClick={onOwed} />
            <HeroTile label="You owe" value={oweTotal} onClick={onOwe} align="end" />
          </div>
        </>
      )}
    </section>
  );
}

function HeroTile({
  label,
  value,
  onClick,
  align = 'start',
}: {
  label: string;
  value: MinorUnits;
  onClick: () => void;
  align?: 'start' | 'end';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-2xl border-none bg-white/[0.12] px-3.5 py-3 text-white transition-colors active:bg-white/20 ${
        align === 'end' ? 'items-end text-right' : 'items-start text-left'
      }`}
    >
      <span className="flex items-center gap-0.5 text-[0.75rem] opacity-80">
        {label}
        <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
      </span>
      <span className="mt-1">
        <Amount value={value} size="md" color="#fff" />
      </span>
    </button>
  );
}

/** "Good morning" / "Good afternoon" / "Good evening" in Addis Ababa. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Addis_Ababa',
    }).format(now),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
