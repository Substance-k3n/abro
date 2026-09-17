import { assertSharesMatchTotal, expenseParticipantSchema, splitTypeSchema } from './split';

describe('assertSharesMatchTotal', () => {
  it('does not throw when shares sum exactly to the total', () => {
    expect(() =>
      assertSharesMatchTotal(100n, [{ amount: 34n }, { amount: 33n }, { amount: 33n }]),
    ).not.toThrow();
  });

  it('throws when shares sum to less than the total', () => {
    expect(() => assertSharesMatchTotal(100n, [{ amount: 40n }, { amount: 40n }])).toThrow(
      /must sum to the expense total/,
    );
  });

  it('throws when shares sum to more than the total', () => {
    expect(() => assertSharesMatchTotal(100n, [{ amount: 60n }, { amount: 60n }])).toThrow(
      /must sum to the expense total/,
    );
  });

  it('accepts a single participant covering the full total', () => {
    expect(() => assertSharesMatchTotal(500n, [{ amount: 500n }])).not.toThrow();
  });

  it('treats a zero total with no participants as valid', () => {
    expect(() => assertSharesMatchTotal(0n, [])).not.toThrow();
  });
});

describe('expenseParticipantSchema', () => {
  it('accepts an integer minor-units string amount', () => {
    expect(expenseParticipantSchema.safeParse({ userId: 'u1', amount: '1050' }).success).toBe(true);
  });

  it('accepts a negative integer string (e.g. a settlement leg)', () => {
    expect(expenseParticipantSchema.safeParse({ userId: 'u1', amount: '-1050' }).success).toBe(
      true,
    );
  });

  it('rejects a decimal amount string', () => {
    expect(expenseParticipantSchema.safeParse({ userId: 'u1', amount: '10.50' }).success).toBe(
      false,
    );
  });

  it('rejects a non-numeric amount string', () => {
    expect(expenseParticipantSchema.safeParse({ userId: 'u1', amount: 'abc' }).success).toBe(false);
  });
});

describe('splitTypeSchema', () => {
  it('accepts every documented split type', () => {
    for (const type of ['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES', 'SETTLEMENT']) {
      expect(splitTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('rejects an unknown split type', () => {
    expect(splitTypeSchema.safeParse('REFUND').success).toBe(false);
  });
});
