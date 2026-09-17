import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * docs/BACKEND_PLAN.md item 5 (hardening pass): a request that fails after
 * its DB write commits but before the response reaches the client (a
 * timeout, a dropped connection) currently leaves the client with a 500 and
 * no way to know the create actually happened -- retrying blindly creates a
 * duplicate financial record. An `Idempotency-Key` header, scoped per
 * (user, key, endpoint), lets a retried request return the original result
 * instead of re-running the write.
 *
 * Reserve-then-fill, not "run then try to remember": the key row is
 * created (with a null `response`) *before* `fn` runs, so a second,
 * genuinely concurrent request with the same key fails fast on the unique
 * constraint instead of racing to run `fn` twice. If `fn` throws, the
 * reservation is deleted so a legitimate retry isn't permanently blocked.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** `key` is optional -- callers without an Idempotency-Key header just run `fn` unguarded, same as before this existed. */
  async run<T>(
    userId: string,
    key: string | undefined,
    endpoint: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return fn();
    }

    const reservation = await this.reserve(userId, key, endpoint);
    if (reservation.cached !== undefined) {
      return reservation.cached as T;
    }

    try {
      const result = await fn();
      // The exact wire shape Nest would have sent (BigInt -> string, same
      // as the global shim in bigint-json.ts does for real responses;
      // done explicitly here rather than relying on that shim having run,
      // since this runs independently of main.ts's bootstrap order) -- a
      // replay returns that plain JSON, not a live Prisma object, which is
      // the correct thing for a duplicate HTTP response to be.
      const wireShape = JSON.parse(
        JSON.stringify(result, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ) as Prisma.InputJsonValue;
      await this.prisma.idempotencyKey.update({
        where: { id: reservation.id },
        data: { response: wireShape },
      });
      return result;
    } catch (error) {
      await this.prisma.idempotencyKey.delete({ where: { id: reservation.id } });
      throw error;
    }
  }

  private async reserve(
    userId: string,
    key: string,
    endpoint: string,
  ): Promise<{ id: string; cached?: unknown }> {
    try {
      const row = await this.prisma.idempotencyKey.create({ data: { userId, key, endpoint } });
      return { id: row.id };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.prisma.idempotencyKey.findUniqueOrThrow({
        where: { userId_key_endpoint: { userId, key, endpoint } },
      });
      if (existing.response === null) {
        throw new ConflictException({
          code: 'DUPLICATE_REQUEST_IN_FLIGHT',
          message: 'A request with this idempotency key is already being processed.',
        });
      }
      return { id: existing.id, cached: existing.response };
    }
  }
}

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: unknown }).code === 'P2002';
