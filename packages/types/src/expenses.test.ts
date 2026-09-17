import { createExpenseSchema } from './expenses';

describe('createExpenseSchema', () => {
  const base = {
    name: 'Dinner',
    category: 'Food',
    amount: '100',
    expenseDate: '2026-01-01',
  };

  it('accepts a valid EQUAL split', () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      splitType: 'EQUAL',
      participants: [{ userId: 'a' }, { userId: 'b' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects splitType: SETTLEMENT — per ADR-003, settlements never go through the expense-create path', () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      splitType: 'SETTLEMENT',
      participants: [{ userId: 'a' }, { userId: 'b' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      amount: '0',
      splitType: 'EQUAL',
      participants: [{ userId: 'a' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects EXACT participants missing the required amount field', () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      splitType: 'EXACT',
      participants: [{ userId: 'a' }], // missing required `amount` for EXACT
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one participant', () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      splitType: 'EQUAL',
      participants: [],
    });
    expect(result.success).toBe(false);
  });
});
