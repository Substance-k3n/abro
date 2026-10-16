-- Late fees on group debt (ADR-026). Off unless an admin turns them on.
-- A fee is a fact like any other: an INTEREST expense paid by the person
-- owed, with the debtor's share carrying the amount -- so balances stay
-- derived from expenses (ADR-003 shape) and a fee can be deleted to
-- waive it.
ALTER TYPE split_type ADD VALUE IF NOT EXISTS 'INTEREST';

ALTER TABLE groups
    -- Per day, in basis points of the overdue amount (100 = 1%); 0 = off.
    ADD COLUMN interest_rate_bp INT NOT NULL DEFAULT 0
        CHECK (interest_rate_bp BETWEEN 0 AND 500),
    -- Days a debt can stay unpaid before a fee starts.
    ADD COLUMN interest_grace_days INT NOT NULL DEFAULT 7
        CHECK (interest_grace_days BETWEEN 0 AND 60),
    -- The most a debt can grow by in fees, in basis points of it.
    ADD COLUMN interest_cap_bp INT NOT NULL DEFAULT 2000
        CHECK (interest_cap_bp BETWEEN 100 AND 10000),
    -- When fees were turned on: debt added before this never gets one.
    ADD COLUMN interest_since TIMESTAMPTZ;

-- One row per member per group per day the daily job charged them, so a
-- restart never charges a day twice. No amounts: those are the expenses.
CREATE TABLE late_fee_days (
    group_id   UUID NOT NULL REFERENCES groups(id),
    debtor_id  UUID NOT NULL REFERENCES profiles(id),
    day        DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, debtor_id, day)
);
