-- Ported from apps/api/prisma/schema/expenses.prisma.
--
-- amount / expense_participants.amount are BIGINT minor units -- never
-- floating point. sum(expense_participants.amount) for a given expense
-- MUST equal expenses.amount -- enforced server-side (internal/money's
-- AssertSharesMatchTotal), not by the DB.
CREATE TYPE split_type AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES', 'SETTLEMENT');

CREATE TABLE expenses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable: a personal IOU has no group.
    group_id      UUID REFERENCES groups(id),
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    amount        BIGINT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'ETB',
    paid_by_id    UUID NOT NULL REFERENCES profiles(id),
    split_type    split_type NOT NULL,
    expense_date  TIMESTAMPTZ NOT NULL,
    receipt_path  TEXT,
    notes         TEXT,
    -- Points at the exact currency_rates snapshot used at creation time --
    -- never recomputed when rates later change.
    conversion_id UUID REFERENCES currency_rates(id) ON DELETE RESTRICT,
    deleted_at    TIMESTAMPTZ,
    deleted_by_id UUID REFERENCES profiles(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_id UUID REFERENCES profiles(id)
);
CREATE INDEX expenses_paid_by_id_idx ON expenses (paid_by_id);
CREATE INDEX expenses_group_id_idx ON expenses (group_id);
CREATE INDEX expenses_expense_date_idx ON expenses (expense_date);
CREATE INDEX expenses_deleted_at_idx ON expenses (deleted_at);
CREATE INDEX expenses_conversion_id_idx ON expenses (conversion_id);

CREATE TABLE expense_participants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id),
    -- Non-negative always, including for SETTLEMENT rows (ADR-003).
    amount     BIGINT NOT NULL CHECK (amount >= 0),
    UNIQUE (expense_id, user_id)
);
CREATE INDEX expense_participants_user_id_idx ON expense_participants (user_id);

CREATE TABLE expense_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES profiles(id),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expense_notes_expense_id_idx ON expense_notes (expense_id);
