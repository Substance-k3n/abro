import { type CurrencyMeta, ETB, type MinorUnits, formatMoney, toDecimal } from '@abro/types';

export interface BalanceCardProps {
  /** Positive: net owed to you. Negative: net you owe. */
  net: MinorUnits;
  owedTotal: MinorUnits;
  oweTotal: MinorUnits;
  currency?: CurrencyMeta;
  label?: string;
}

/** The gradient hero card showing net balance + a split progress bar +
 * owed/owe breakdown. Ported from the prototype's HomeScreen balance
 * summary card (docs/WIRING_PLAN.md Phase 3) — reused wherever a
 * top-level balance summary is shown (Home, Balances Overview). */
export function BalanceCard({
  net,
  owedTotal,
  oweTotal,
  currency = ETB,
  label = 'Net balance',
}: BalanceCardProps) {
  const absNet = net < 0n ? -net : net;
  const total = owedTotal + oweTotal;
  const owedPct = total > 0n ? Number((owedTotal * 100n) / total) : 50;
  const absNetFormatted = toDecimal(absNet, currency.decimalDigits).toLocaleString(undefined, {
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  });

  return (
    <div className="neo-card-accent rounded-3xl p-6 text-white">
      <p className="mb-1 text-[0.78rem] font-medium opacity-75">{label}</p>
      <div className="mb-5 flex items-baseline gap-1.5">
        <span className="font-display text-[2.4rem] font-extrabold leading-none tracking-tighter">
          {absNetFormatted}
        </span>
        <span className="text-[0.9rem] opacity-80">{currency.code}</span>
        <span className="rounded-lg bg-white/20 px-2 py-0.5 text-[0.8rem] font-medium">
          {net >= 0n ? 'owed to you' : 'you owe'}
        </span>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white/80 transition-[width] duration-500"
          style={{ width: `${owedPct}%` }}
        />
      </div>

      <div className="flex justify-between">
        <div>
          <p className="mb-0.5 text-[0.7rem] opacity-70">Owed to you</p>
          <p className="font-display text-[1.1rem] font-bold tracking-tight">
            {formatMoney(owedTotal, currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-0.5 text-[0.7rem] opacity-70">You owe</p>
          <p className="font-display text-[1.1rem] font-bold tracking-tight">
            {formatMoney(oweTotal, currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
