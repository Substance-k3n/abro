-- Payment reminders (roadmap P6, ADR-018): a group admin nudges a member
-- who owes the group. Each row is one reminder that was sent -- an audit
-- trail, and what the once-per-24-hours limit per (group, recipient) is
-- checked against. No amount is stored: what someone owes is always
-- derived from expenses, never from here.
CREATE TABLE payment_reminders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id    UUID NOT NULL REFERENCES profiles(id),
    recipient_id UUID NOT NULL REFERENCES profiles(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_reminders_group_recipient_idx
    ON payment_reminders (group_id, recipient_id, created_at DESC);
