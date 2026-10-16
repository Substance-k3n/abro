-- Whose turn to pay (ADR-025). When an expense leaves its payer covering
-- at least this much for the group (minor units of the group's
-- currency), every member is told who should pay next. 0 turns it off.
-- The line itself is derived from balances, never stored.
ALTER TABLE groups ADD COLUMN next_payer_threshold BIGINT NOT NULL DEFAULT 500000
    CHECK (next_payer_threshold >= 0);
