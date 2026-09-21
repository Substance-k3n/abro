import { type CurrencyMeta, ETB, type MinorUnits, formatMoney } from '@abro/types';

import { CategoryIcon } from './icons';

export interface ActivityItemProps {
  /** Category key fed to CategoryIcon (e.g. "Food", "Settlement"). */
  category: string;
  title: string;
  sub: string;
  amount: MinorUnits;
  dir: 'owe' | 'receive' | 'paid';
  time: string;
  currency?: CurrencyMeta;
  onClick?: () => void;
}

/** One row in an activity/expense list: category icon, title/subtitle,
 * signed amount + timestamp. Ported from the prototype's HomeScreen recent
 * activity row and ActivityScreen (docs/WIRING_PLAN.md Phase 3) — the
 * canonical shape both screens' feeds share. */
export function ActivityItem({
  category,
  title,
  sub,
  amount,
  dir,
  time,
  currency = ETB,
  onClick,
}: ActivityItemProps) {
  const amountColor =
    dir === 'receive' ? 'var(--c-green)' : dir === 'owe' ? 'var(--c-red)' : 'var(--t-muted)';
  const sign = dir === 'receive' ? '+' : dir === 'owe' ? '-' : '';

  return (
    <button
      onClick={onClick}
      className="neo-raised-sm flex items-center gap-3 rounded-2xl border-none px-3.5 py-3 text-left"
    >
      <div
        className="neo-raised-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
        style={{ color: 'var(--t-muted)' }}
      >
        <CategoryIcon label={category} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="mb-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.88rem] font-semibold"
          style={{ color: 'var(--t-primary)' }}
        >
          {title}
        </p>
        <p
          className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.72rem]"
          style={{ color: 'var(--t-dim)' }}
        >
          {sub}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="mb-0.5 font-mono text-[0.82rem] font-semibold" style={{ color: amountColor }}>
          {sign}
          {formatMoney(amount, currency)}
        </p>
        <p className="text-[0.68rem]" style={{ color: '#b0b5c0' }}>
          {time}
        </p>
      </div>
    </button>
  );
}
