import { netBalance } from './balances';

describe('netBalance', () => {
  it('returns zero for no entries', () => {
    expect(netBalance([])).toBe(0n);
  });

  it('is positive when A owes B (a single expense A did not pay for)', () => {
    // Dinner paid by B, A's share is 500 -> A owes B 500.
    expect(netBalance([{ owedByA: true, amount: 500n }])).toBe(500n);
  });

  it('is negative when B owes A', () => {
    expect(netBalance([{ owedByA: false, amount: 200n }])).toBe(-200n);
  });

  it('nets opposing debts from separate expenses (PRD §16 example: owe 500, owed 200 -> net owe 300)', () => {
    const entries = [
      { owedByA: true, amount: 500n },
      { owedByA: false, amount: 200n },
    ];
    expect(netBalance(entries)).toBe(300n);
  });

  it('a settlement entry fully cancels a prior debt (PRD §19/§74)', () => {
    // A owed B 100 from an expense, then A settles 100 with B -- the
    // settlement contributes an entry in the *opposite* direction, which
    // is how SettlementsService constructs it (see its integration spec).
    const entries = [
      { owedByA: true, amount: 100n }, // the original expense debt
      { owedByA: false, amount: 100n }, // the settlement cancelling it
    ];
    expect(netBalance(entries)).toBe(0n);
  });

  it('a partial settlement leaves the remainder outstanding (PRD §75)', () => {
    const entries = [
      { owedByA: false, amount: 500n }, // A paid, B owes A 500
      { owedByA: true, amount: 200n }, // B settles 200 with A -> A owes B 200 entry
    ];
    expect(netBalance(entries)).toBe(-300n); // B still owes A 300
  });

  it('handles many small entries without losing precision', () => {
    const entries = Array.from({ length: 1000 }, (_, i) => ({
      owedByA: i % 2 === 0,
      amount: BigInt(i + 1),
    }));
    const expected = entries.reduce((net, e) => (e.owedByA ? net + e.amount : net - e.amount), 0n);
    expect(netBalance(entries)).toBe(expected);
  });
});
