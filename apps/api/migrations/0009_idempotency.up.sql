-- Ported from apps/api/prisma/schema/idempotency.prisma. A client-supplied
-- Idempotency-Key header, scoped per user + endpoint, lets a retried
-- request return the original result instead of creating a duplicate
-- expense/settlement. response is NULL while the guarded operation is
-- still in flight (a reservation row, written before running it, so a
-- concurrent duplicate request fails fast on the unique constraint instead
-- of racing to run the operation twice).
CREATE TABLE idempotency_keys (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id),
    key        TEXT NOT NULL,
    endpoint   TEXT NOT NULL,
    response   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, key, endpoint)
);
