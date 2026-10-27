-- Missed payments when entering an ekub that was already running
-- (ADR-024). The admin enters the rounds already over and marks who
-- didn't pay whom. The two then skip each other for the whole cycle, the
-- same as a late joiner and the people whose turn came before: the one
-- who missed it isn't paid by the other on their own turn either.
--
-- One row per pair. payer/recipient record which payment was missed (so
-- the history can say "Z didn't pay Y in round 2"); the pair can only be
-- marked once, in either direction.
CREATE TABLE ekub_missed_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ekub_id             UUID NOT NULL REFERENCES ekubs(id) ON DELETE CASCADE,
    payer_member_id     UUID NOT NULL REFERENCES ekub_members(id) ON DELETE CASCADE,
    recipient_member_id UUID NOT NULL REFERENCES ekub_members(id) ON DELETE CASCADE,
    created_by_id       UUID NOT NULL REFERENCES profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (payer_member_id <> recipient_member_id)
);
CREATE UNIQUE INDEX ekub_missed_payments_pair_idx ON ekub_missed_payments (
    LEAST(payer_member_id, recipient_member_id),
    GREATEST(payer_member_id, recipient_member_id)
);
CREATE INDEX ekub_missed_payments_ekub_idx ON ekub_missed_payments (ekub_id);
