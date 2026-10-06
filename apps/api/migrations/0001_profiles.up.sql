-- Ported from apps/api/prisma/schema/users.prisma (docs/DECISIONS.md ADR-007).
--
-- Financial correctness rules this schema exists to uphold (ABRO_PRD.md §8, §45):
--   - Money is always BIGINT minor units. Never floating point.
--   - Expense + expense_participants are the source of truth; balances are
--     computed, not stored.
--   - Soft-delete only on expenses (deleted_at), never a hard delete.
--
-- IDs: Prisma's original schema used cuid(). This rewrite uses UUID v4
-- (gen_random_uuid(), pgcrypto) instead -- an independent ID scheme is fine
-- since this is a from-scratch rewrite behind the same API contract, not a
-- data migration from the old system.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE profiles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name       TEXT NOT NULL,
    avatar_url         TEXT,
    phone              TEXT UNIQUE,
    -- Both auth methods (Email OTP and Google OAuth) key off this -- a
    -- sign-in via either method resolves to the same profile when the
    -- email matches.
    email              TEXT UNIQUE,
    preferred_currency TEXT NOT NULL DEFAULT 'ETB',
    locale             TEXT NOT NULL DEFAULT 'en',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
