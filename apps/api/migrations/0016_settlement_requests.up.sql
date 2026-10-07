-- Settlement confirmation (trial feedback 2026-10-07, ADR-019). When the
-- person who owes records a payment, it waits here until the person who
-- was paid confirms it. A request is a claim, not a fact: it never
-- affects any balance. Confirming creates the SETTLEMENT expense row
-- (ADR-003, unchanged) and links it here; rejecting or cancelling just
-- closes the request. A payment the receiver records themselves skips
-- this table and becomes a SETTLEMENT expense straight away.
CREATE TYPE settlement_request_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

CREATE TABLE settlement_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id      UUID NOT NULL REFERENCES profiles(id),
    recipient_id  UUID NOT NULL REFERENCES profiles(id),
    group_id      UUID REFERENCES groups(id),
    amount        BIGINT NOT NULL CHECK (amount > 0),
    currency      TEXT NOT NULL,
    receipt_path  TEXT,
    status        settlement_request_status NOT NULL DEFAULT 'PENDING',
    settlement_id UUID REFERENCES expenses(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ,
    CHECK (payer_id != recipient_id)
);
CREATE INDEX settlement_requests_recipient_idx ON settlement_requests (recipient_id, status);
CREATE INDEX settlement_requests_payer_idx ON settlement_requests (payer_id, status);
