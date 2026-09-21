import { type CurrencyMeta, ETB, type MinorUnits, formatMoney } from '@abro/types';

export interface MoneyDisplayProps {
  amount: MinorUnits;
  currency?: CurrencyMeta;
  className?: string;
  style?: React.CSSProperties;
}

/** Plain formatted amount + currency code, e.g. "1,450 ETB" — backs every
 * money figure in the app with `@abro/types`' `formatMoney`, replacing the
 * prototype's local `fmt()` helper (docs/WIRING_PLAN.md Phase 3). */
export function MoneyDisplay({ amount, currency = ETB, className, style }: MoneyDisplayProps) {
  return (
    <span className={className} style={style}>
      {formatMoney(amount, currency)}
    </span>
  );
}

export type AmountDirection = 'owe' | 'receive' | 'paid';

export interface AmountBadgeProps {
  amount: MinorUnits;
  dir: AmountDirection;
  currency?: CurrencyMeta;
  className?: string;
}

/** Direction-colored amount pill: red "-" for owe, green "+" for receive,
 * neutral gray for anything else (e.g. "paid", a fact with no direction).
 * Ported from the prototype's AmountBadge. */
export function AmountBadge({ amount, dir, currency = ETB, className = '' }: AmountBadgeProps) {
  const formatted = formatMoney(amount, currency);

  if (dir === 'owe') {
    return (
      <span
        className={`neo-badge-red rounded-lg px-2 py-1 font-mono text-xs font-semibold ${className}`}
      >
        -{formatted}
      </span>
    );
  }
  if (dir === 'receive') {
    return (
      <span
        className={`neo-badge-green rounded-lg px-2 py-1 font-mono text-xs font-semibold ${className}`}
      >
        +{formatted}
      </span>
    );
  }
  return (
    <span
      className={`rounded-lg px-2 py-1 font-mono text-xs font-semibold ${className}`}
      style={{
        background: '#eff1f5',
        color: 'var(--t-muted)',
        boxShadow: 'inset 2px 2px 5px #c5cad1, inset -2px -2px 5px #fff',
      }}
    >
      {formatted}
    </span>
  );
}
