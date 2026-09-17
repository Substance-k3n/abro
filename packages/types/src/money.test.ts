import { splitByWeights, splitEqually, sum } from './money';

describe('splitEqually', () => {
  it('splits evenly when the total divides cleanly', () => {
    expect(splitEqually(300n, 3)).toEqual([100n, 100n, 100n]);
  });

  it('distributes the remainder one unit at a time, starting from the first participant', () => {
    expect(splitEqually(100n, 3)).toEqual([34n, 33n, 33n]);
  });

  it('always preserves the total, including with a large participant count', () => {
    const total = 10007n;
    const parts = 13;
    const shares = splitEqually(total, parts);
    expect(shares).toHaveLength(parts);
    expect(sum(shares)).toBe(total);
  });

  it('gives the sole participant the entire amount', () => {
    expect(splitEqually(999n, 1)).toEqual([999n]);
  });

  it('handles a zero total', () => {
    expect(splitEqually(0n, 4)).toEqual([0n, 0n, 0n, 0n]);
  });

  it('rejects zero or negative participant counts', () => {
    expect(() => splitEqually(100n, 0)).toThrow();
    expect(() => splitEqually(100n, -1)).toThrow();
  });
});

describe('splitByWeights', () => {
  it('splits proportionally to shares (SHARES split type)', () => {
    // 100 total, weights 1:1:2 -> 25/25/50
    expect(splitByWeights(100n, [1n, 1n, 2n])).toEqual([25n, 25n, 50n]);
  });

  it('splits proportionally to basis points (PERCENTAGE split type)', () => {
    // 10000 minor units, 30%/70% as basis points out of 10000
    expect(splitByWeights(10000n, [3000n, 7000n])).toEqual([3000n, 7000n]);
  });

  it('distributes rounding remainder deterministically while preserving the total', () => {
    // 100 split 3 ways by equal weights hits the same non-divisible case as splitEqually
    const shares = splitByWeights(100n, [1n, 1n, 1n]);
    expect(sum(shares)).toBe(100n);
    expect(shares).toEqual([34n, 33n, 33n]);
  });

  it('preserves the total for uneven weights that do not divide cleanly', () => {
    const total = 10007n;
    const weights = [3n, 5n, 2n, 7n];
    const shares = splitByWeights(total, weights);
    expect(shares).toHaveLength(weights.length);
    expect(sum(shares)).toBe(total);
  });

  it('gives the sole participant the entire amount regardless of its weight', () => {
    expect(splitByWeights(500n, [7n])).toEqual([500n]);
  });

  it('rejects an empty weights array', () => {
    expect(() => splitByWeights(100n, [])).toThrow();
  });

  it('rejects a non-positive total weight', () => {
    expect(() => splitByWeights(100n, [0n, 0n])).toThrow();
  });
});
