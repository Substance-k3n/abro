import { sum } from './money';
import { type NetPosition, type SimplifiedTransaction, simplifyDebts } from './debt-simplification';

/** Replays transactions against the original positions; every balance must land exactly on zero. */
const applyAndAssertSettled = (
  positions: readonly NetPosition[],
  txns: SimplifiedTransaction[],
) => {
  const remaining = new Map(positions.map((p) => [p.userId, p.netBalance]));
  for (const txn of txns) {
    remaining.set(txn.fromUserId, (remaining.get(txn.fromUserId) ?? 0n) + txn.amount);
    remaining.set(txn.toUserId, (remaining.get(txn.toUserId) ?? 0n) - txn.amount);
  }
  for (const [userId, balance] of remaining) {
    expect({ userId, balance }).toEqual({ userId, balance: 0n });
  }
};

describe('simplifyDebts', () => {
  it('returns no transactions when everyone is already settled', () => {
    expect(simplifyDebts([])).toEqual([]);
    expect(
      simplifyDebts([
        { userId: 'a', netBalance: 0n },
        { userId: 'b', netBalance: 0n },
      ]),
    ).toEqual([]);
  });

  it('settles a simple pair directly', () => {
    const positions: NetPosition[] = [
      { userId: 'a', netBalance: -100n },
      { userId: 'b', netBalance: 100n },
    ];
    const txns = simplifyDebts(positions);
    expect(txns).toEqual([{ fromUserId: 'a', toUserId: 'b', amount: 100n }]);
    applyAndAssertSettled(positions, txns);
  });

  it("collapses PRD §18's chain example (A owes B, B owes C, C owes D, all 100) to one transaction", () => {
    // Net positions after the chain: A:-100, B:0, C:0, D:+100.
    const positions: NetPosition[] = [
      { userId: 'A', netBalance: -100n },
      { userId: 'B', netBalance: 0n },
      { userId: 'C', netBalance: 0n },
      { userId: 'D', netBalance: 100n },
    ];
    const txns = simplifyDebts(positions);
    expect(txns).toEqual([{ fromUserId: 'A', toUserId: 'D', amount: 100n }]);
    applyAndAssertSettled(positions, txns);
  });

  it('uses at most n-1 transactions and preserves the total obligation for an uneven multi-party case', () => {
    // owed 500, owed 300, owes 400, owes 400 (sums to zero).
    const positions: NetPosition[] = [
      { userId: 'a', netBalance: 500n },
      { userId: 'b', netBalance: 300n },
      { userId: 'c', netBalance: -400n },
      { userId: 'd', netBalance: -400n },
    ];
    const txns = simplifyDebts(positions);
    expect(txns.length).toBeLessThanOrEqual(positions.length - 1);
    applyAndAssertSettled(positions, txns);
  });

  it('breaks ties deterministically by userId when multiple creditors/debtors share the same magnitude', () => {
    const positions: NetPosition[] = [
      { userId: 'zed', netBalance: 100n },
      { userId: 'amy', netBalance: 100n },
      { userId: 'bob', netBalance: -100n },
      { userId: 'cam', netBalance: -100n },
    ];
    const txns = simplifyDebts(positions);
    // Smallest userId on each side is picked first: amy (creditor) vs bob (debtor).
    expect(txns[0]).toEqual({ fromUserId: 'bob', toUserId: 'amy', amount: 100n });
    applyAndAssertSettled(positions, txns);
  });

  it('is deterministic: repeated calls on the same input produce identical output', () => {
    const positions: NetPosition[] = [
      { userId: 'a', netBalance: 733n },
      { userId: 'b', netBalance: -211n },
      { userId: 'c', netBalance: -522n },
    ];
    const first = simplifyDebts(positions);
    const second = simplifyDebts(positions);
    expect(second).toEqual(first);
  });

  it('handles a large group without losing precision or producing more than n-1 transactions', () => {
    const positions: NetPosition[] = Array.from({ length: 40 }, (_, i) => ({
      userId: `u${i}`,
      netBalance: BigInt(i - 20) * 137n, // roughly half positive, half negative, sums to a known value
    }));
    // Force an exact zero-sum by adjusting the last entry to absorb the remainder.
    const runningTotal = sum(positions.map((p) => p.netBalance));
    positions[positions.length - 1]!.netBalance -= runningTotal;

    const txns = simplifyDebts(positions);
    const nonZero = positions.filter((p) => p.netBalance !== 0n).length;
    expect(txns.length).toBeLessThanOrEqual(nonZero - 1);
    applyAndAssertSettled(positions, txns);
  });
});
