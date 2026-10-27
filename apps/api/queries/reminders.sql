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

-- name: CreateFriendReminderIfDue :one
-- A friend's nudge to a friend who owes them (ADR-023): like
-- CreatePaymentReminderIfDue, at most once per 24 hours per pair, counting
-- automatic reminders too.
INSERT INTO payment_reminders (creditor_id, sender_id, recipient_id)
SELECT sqlc.arg('creditor_id'), sqlc.arg('creditor_id'), sqlc.arg('recipient_id')
WHERE NOT EXISTS (
    SELECT 1 FROM payment_reminders r
    WHERE r.group_id IS NULL AND r.creditor_id = sqlc.arg('creditor_id')
      AND r.recipient_id = sqlc.arg('recipient_id')
      AND r.created_at > now() - interval '24 hours'
)
RETURNING *;

-- name: GetLatestFriendReminder :one
SELECT * FROM payment_reminders
WHERE group_id IS NULL AND creditor_id = $1 AND recipient_id = $2
ORDER BY created_at DESC
LIMIT 1;

-- name: CreateAutoGroupReminderIfDue :one
-- The daily job's reminder for a group debt (ADR-023). Skipped when the
-- member had any reminder in this group after not_since (14 days back),
-- so a recent manual nudge counts too.
INSERT INTO payment_reminders (group_id, recipient_id, kind)
SELECT sqlc.arg('group_id'), sqlc.arg('recipient_id'), 'AUTO'
WHERE NOT EXISTS (
    SELECT 1 FROM payment_reminders r
    WHERE r.group_id = sqlc.arg('group_id') AND r.recipient_id = sqlc.arg('recipient_id')
      AND r.created_at > sqlc.arg('not_since')
)
RETURNING *;

-- name: CreateAutoFriendReminderIfDue :one
-- CreateAutoGroupReminderIfDue for a friend debt.
INSERT INTO payment_reminders (creditor_id, recipient_id, kind)
SELECT sqlc.arg('creditor_id'), sqlc.arg('recipient_id'), 'AUTO'
WHERE NOT EXISTS (
    SELECT 1 FROM payment_reminders r
    WHERE r.group_id IS NULL AND r.creditor_id = sqlc.arg('creditor_id')
      AND r.recipient_id = sqlc.arg('recipient_id')
      AND r.created_at > sqlc.arg('not_since')
)
RETURNING *;

-- name: ListAutoRemindGroups :many
SELECT id, name, currency FROM groups
WHERE deleted_at IS NULL AND auto_remind;

-- name: ListAcceptedFriendPairs :many
-- Every friendship, with whether each side wants the friends who owe
-- them reminded automatically.
SELECT f.user_id, f.friend_id,
       u.auto_remind_friends AS user_auto_remind,
       fr.auto_remind_friends AS friend_auto_remind
FROM friendships f
JOIN profiles u ON u.id = f.user_id
JOIN profiles fr ON fr.id = f.friend_id
WHERE f.status = 'ACCEPTED';

-- name: ListActiveMemberIDs :many
SELECT user_id FROM group_members
WHERE group_id = $1 AND status = 'ACTIVE';

-- name: GetAutoRemindFriends :one
SELECT auto_remind_friends FROM profiles WHERE id = $1;

-- name: SetAutoRemindFriends :one
UPDATE profiles SET auto_remind_friends = $2, updated_at = now()
WHERE id = $1
RETURNING auto_remind_friends;
