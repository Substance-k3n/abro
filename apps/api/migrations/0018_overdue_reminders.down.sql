ALTER TABLE profiles DROP COLUMN auto_remind_friends;
ALTER TABLE groups DROP COLUMN auto_remind;
-- Friend and automatic reminders can't exist in the old shape.
DELETE FROM payment_reminders WHERE group_id IS NULL OR sender_id IS NULL;
DROP INDEX payment_reminders_friend_idx;
ALTER TABLE payment_reminders
    DROP CONSTRAINT payment_reminders_sender_check,
    DROP CONSTRAINT payment_reminders_scope_check,
    DROP COLUMN kind,
    DROP COLUMN creditor_id,
    ALTER COLUMN sender_id SET NOT NULL,
    ALTER COLUMN group_id SET NOT NULL;
