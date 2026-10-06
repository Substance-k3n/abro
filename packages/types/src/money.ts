/**
 * Money, per ABRO_PRD.md §8.3 and §28: always an integer in the smallest
 * currency unit (minor units) — e.g. 100.50 ETB is stored as 10050n.
 * Never a float. Never a JS `number` past the point it's rendered for display.
 *
 * This module is shared between apps/web and apps/api so both sides run the
 * exact same arithmetic — the PRD's "never trust client-calculated balances"
 * rule only holds if the server's math can't silently drift from the client's.
 */

/** An amount in the smallest unit of its currency (cents, santim, etc). */
export type MinorUnits = bigint;

export const ZERO: MinorUnits = 0n;

export const add = (a: MinorUnits, b: MinorUnits): MinorUnits => a + b;

export const subtract = (a: MinorUnits, b: MinorUnits): MinorUnits => a - b;

export const negate = (a: MinorUnits): MinorUnits => -a;

export const isZero = (a: MinorUnits): boolean => a === 0n;

export const isPositive = (a: MinorUnits): boolean => a > 0n;

export const isNegative = (a: MinorUnits): boolean => a < 0n;

export const abs = (a: MinorUnits): MinorUnits => (a < 0n ? -a : a);

export const sum = (amounts: readonly MinorUnits[]): MinorUnits =>
  amounts.reduce((total, amount) => total + amount, 0n);

/**
 * Split `total` evenly across `parts` shares, distributing any leftover minor
 * units deterministically (one extra unit each, starting from the first
 * participant) so `sum(result) === total` always holds exactly.
 *
 * ABRO_PRD.md §14: "If division creates a remainder, the remainder must be
 * distributed deterministically while preserving the total."
 */
export const splitEqually = (total: MinorUnits, parts: number): MinorUnits[] => {
  if (parts <= 0) {
    throw new Error('splitEqually requires at least one participant');
  }

  const base = total / BigInt(parts);
  const remainder = total % BigInt(parts);

  return Array.from({ length: parts }, (_, index) => (index < remainder ? base + 1n : base));
};

/**
 * Split `total` proportionally by `weights` (shares, or basis points for a
 * percentage split), distributing any leftover minor units deterministically
 * (one extra unit each, starting from the first participant) so
 * `sum(result) === total` always holds exactly — same guarantee as
 * splitEqually, generalized to non-equal ratios. ABRO_PRD.md §14 (Shares,
 * Percentage).
 */
export const splitByWeights = (total: MinorUnits, weights: readonly bigint[]): MinorUnits[] => {
  if (weights.length === 0) {
    throw new Error('splitByWeights requires at least one participant');
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0n);
  if (totalWeight <= 0n) {
    throw new Error('splitByWeights requires a positive total weight');
  }

  const bases = weights.map((w) => (total * w) / totalWeight);
  let remainder = total - sum(bases);

  return bases.map((base) => {
    if (remainder > 0n) {
      remainder -= 1n;
      return base + 1n;
    }
    return base;
  });
};

/** Convert a decimal amount (e.g. from a form input) to minor units. */
export const fromDecimal = (amount: number, decimalDigits: number): MinorUnits => {
  const factor = 10 ** decimalDigits;
  return BigInt(Math.round(amount * factor));
};

/** Convert minor units back to a decimal number for display only. */
export const toDecimal = (amount: MinorUnits, decimalDigits: number): number => {
  const factor = 10 ** decimalDigits;
  return Number(amount) / factor;
};

export interface CurrencyMeta {
  code: string;
  symbol: string;
  nativeSymbol: string;
  decimalDigits: number;
}

/** ABRO_PRD.md §27: ETB is the default; the architecture stays multi-currency capable. */
export const ETB: CurrencyMeta = {
  code: 'ETB',
  symbol: 'Br',
  nativeSymbol: 'ብር',
  decimalDigits: 2,
};

export const formatMoney = (amount: MinorUnits, currency: CurrencyMeta): string => {
  const decimal = toDecimal(amount, currency.decimalDigits);
  return `${decimal.toLocaleString(undefined, {
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  })} ${currency.code}`;
};
