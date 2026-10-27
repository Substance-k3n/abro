-- Ekub, the rotating savings group (ADR-024). Kept apart from groups and
-- expenses: an ekub never changes anyone's friend or group balance.
--
-- Every round, each member puts in their amount and one turn (a slot)
-- takes the pot. A slot is one person putting in the full slot amount,
-- or several people whose amounts add up to it (20k + 20k of a 40k
-- slot); they take the pot together, each in proportion to their part.
-- The admin sets the order (slot_position = the round that slot takes
-- the pot in).
--
-- Who pays whom is derived, never stored: two members in different
-- slots pay into each other's pots if both were in by the earlier of
-- their two turns (joined_round). So someone who joins after a member
-- already took their pot doesn't pay that member, and isn't paid by
-- them. What is stored are the payments: a payer's claim, confirmed by
-- the person paid (the same idea as settlement_requests, ADR-019).
CREATE TYPE ekub_cadence AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE ekub_status AS ENUM ('DRAFT', 'ACTIVE');
CREATE TYPE ekub_payment_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

CREATE TABLE ekubs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'ETB',
    -- What one full slot puts in each round, in minor units.
    slot_amount   BIGINT NOT NULL CHECK (slot_amount > 0),
    cadence       ekub_cadence NOT NULL,
    status        ekub_status NOT NULL DEFAULT 'DRAFT',
    -- Round 1's pot is due on start_date; round n's one cadence step per
    -- round later. Set when the admin starts the ekub.
    start_date    DATE,
    created_by_id UUID NOT NULL REFERENCES profiles(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'DRAFT') = (start_date IS NULL))
);

CREATE TABLE ekub_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ekub_id       UUID NOT NULL REFERENCES ekubs(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES profiles(id),
    role          group_member_role NOT NULL DEFAULT 'MEMBER',
    status        group_member_status NOT NULL DEFAULT 'INVITED',
    -- This member's part of their slot, put in every round.
    amount        BIGINT NOT NULL CHECK (amount > 0),
    -- The round this member's slot takes the pot. Members sharing a slot
    -- share a position.
    slot_position INT NOT NULL CHECK (slot_position > 0),
    -- The first round this member puts in: 1 for everyone there at the
    -- start, later for someone who joined after it began.
    joined_round  INT NOT NULL DEFAULT 1 CHECK (joined_round > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ekub_id, user_id)
);
CREATE INDEX ekub_members_user_idx ON ekub_members (user_id);

CREATE TABLE ekub_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ekub_id             UUID NOT NULL REFERENCES ekubs(id) ON DELETE CASCADE,
    payer_member_id     UUID NOT NULL REFERENCES ekub_members(id) ON DELETE CASCADE,
    recipient_member_id UUID NOT NULL REFERENCES ekub_members(id) ON DELETE CASCADE,
    amount              BIGINT NOT NULL CHECK (amount > 0),
    status              ekub_payment_status NOT NULL DEFAULT 'PENDING',
    created_by_id       UUID NOT NULL REFERENCES profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    CHECK (payer_member_id <> recipient_member_id)
);
-- A payer pays each member once per cycle, so one live payment per pair.
CREATE UNIQUE INDEX ekub_payments_pair_idx
    ON ekub_payments (payer_member_id, recipient_member_id)
    WHERE status <> 'REJECTED';
CREATE INDEX ekub_payments_ekub_idx ON ekub_payments (ekub_id);
