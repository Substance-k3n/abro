/**
 * Prisma money fields (Expense.amount, ExpenseParticipant.amount) are BigInt
 * — JSON.stringify throws on BigInt with no shim. money.ts's contract is
 * "amounts are strings on the wire, bigint only internally"; this is what
 * enforces that everywhere a BigInt reaches a JSON response, instead of
 * requiring every service method to remember to map it manually.
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function (this: bigint) {
  return this.toString();
};

export {};
