import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService (integration)', () => {
  const prisma = new PrismaService();
  const idempotency = new IdempotencyService(prisma);
  const createdProfileIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-idempotency-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: createdProfileIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    createdProfileIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs fn unguarded when no key is given', async () => {
    const user = await makeProfile('A');
    let calls = 0;

    const result = await idempotency.run(user.id, undefined, 'POST /expenses', async () => {
      calls += 1;
      return { ok: true };
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { userId: user.id } })).toBe(0);
  });

  it('runs fn once and replays the cached response on a repeated key', async () => {
    const user = await makeProfile('A');
    let calls = 0;

    const first = await idempotency.run(user.id, 'key-1', 'POST /expenses', async () => {
      calls += 1;
      return { id: 'expense-1', amount: 100n };
    });
    const second = await idempotency.run(user.id, 'key-1', 'POST /expenses', async () => {
      calls += 1;
      return { id: 'expense-2', amount: 200n };
    });

    expect(calls).toBe(1);
    expect(first).toEqual({ id: 'expense-1', amount: 100n });
    // The replay is the JSON-plain wire shape, not a repeat of the live
    // first-call value -- the bigint comes back as a string, by design
    // (see IdempotencyService.run's doc comment).
    expect(second).toEqual({ id: 'expense-1', amount: '100' });
  });

  it('scopes keys per endpoint -- the same key at a different endpoint runs fn again', async () => {
    const user = await makeProfile('A');
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return { calls };
    };

    await idempotency.run(user.id, 'shared-key', 'POST /expenses', fn);
    await idempotency.run(user.id, 'shared-key', 'POST /settlements', fn);

    expect(calls).toBe(2);
  });

  it('scopes keys per user -- a different user with the same key runs fn again', async () => {
    const userA = await makeProfile('A');
    const userB = await makeProfile('B');
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return { calls };
    };

    await idempotency.run(userA.id, 'same-key', 'POST /expenses', fn);
    await idempotency.run(userB.id, 'same-key', 'POST /expenses', fn);

    expect(calls).toBe(2);
  });

  it('deletes the reservation on failure, so a retry with the same key can succeed', async () => {
    const user = await makeProfile('A');
    let attempt = 0;

    await expect(
      idempotency.run(user.id, 'retry-key', 'POST /expenses', async () => {
        attempt += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.idempotencyKey.count({ where: { userId: user.id } })).toBe(0);

    const result = await idempotency.run(user.id, 'retry-key', 'POST /expenses', async () => {
      attempt += 1;
      return { ok: true };
    });

    expect(attempt).toBe(2);
    expect(result).toEqual({ ok: true });
  });

  it('rejects a concurrent duplicate as still in flight, without running fn twice', async () => {
    const user = await makeProfile('A');
    // Simulates a genuinely concurrent second request: a reservation already
    // exists with no response yet (fn from the "first" request hasn't
    // returned).
    await prisma.idempotencyKey.create({
      data: { userId: user.id, key: 'in-flight-key', endpoint: 'POST /expenses' },
    });

    await expect(
      idempotency.run(user.id, 'in-flight-key', 'POST /expenses', async () => ({ ok: true })),
    ).rejects.toThrow(ConflictException);
  });
});
