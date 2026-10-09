-- Overdue reminders (ADR-023). payment_reminders (0014, ADR-018) held
-- only a group admin's manual nudge. It now also holds:
--   * a friend's nudge to a friend who owes them: group_id is NULL and
--     creditor_id is the person owed;
--   * the daily job's automatic reminders (kind AUTO, no sender), for a
--     group debt or a friend debt.
-- Still no amount: what someone owes is always derived from expenses.
ALTER TABLE payment_reminders
    ALTER COLUMN group_id DROP NOT NULL,
    ALTER COLUMN sender_id DROP NOT NULL,
    ADD COLUMN creditor_id UUID REFERENCES profiles(id),
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'MANUAL' CHECK (kind IN ('MANUAL', 'AUTO')),
    -- Exactly one of: a group debt, or a friend debt to creditor_id.
    ADD CONSTRAINT payment_reminders_scope_check CHECK ((group_id IS NULL) <> (creditor_id IS NULL)),
    -- Only automatic reminders have no sender.
    ADD CONSTRAINT payment_reminders_sender_check CHECK ((kind = 'AUTO') = (sender_id IS NULL));

CREATE INDEX payment_reminders_friend_idx
    ON payment_reminders (creditor_id, recipient_id, created_at DESC)
    WHERE group_id IS NULL;

-- Automatic reminders are on unless switched off: per group by an admin,
-- and by each person for the friends who owe them.
ALTER TABLE groups ADD COLUMN auto_remind BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN auto_remind_friends BOOLEAN NOT NULL DEFAULT true;
