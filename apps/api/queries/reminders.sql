-- name: CreatePaymentReminderIfDue :one
-- Inserts only when the recipient hasn't been reminded in this group in
-- the last 24 hours; no row back means it's too soon. Two admins tapping
-- at the same instant could both get through -- harmless (two
-- notifications), so no lock (ADR-018).
INSERT INTO payment_reminders (group_id, sender_id, recipient_id)
SELECT sqlc.arg('group_id'), sqlc.arg('sender_id'), sqlc.arg('recipient_id')
WHERE NOT EXISTS (
    SELECT 1 FROM payment_reminders r
    WHERE r.group_id = sqlc.arg('group_id') AND r.recipient_id = sqlc.arg('recipient_id')
      AND r.created_at > now() - interval '24 hours'
)
RETURNING *;

-- name: GetLatestPaymentReminder :one
SELECT * FROM payment_reminders
WHERE group_id = $1 AND recipient_id = $2
ORDER BY created_at DESC
LIMIT 1;

-- name: ListLatestPaymentReminders :many
-- The most recent reminder per recipient in a group.
SELECT DISTINCT ON (recipient_id) *
FROM payment_reminders
WHERE group_id = $1
ORDER BY recipient_id, created_at DESC;
