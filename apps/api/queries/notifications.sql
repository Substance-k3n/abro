-- name: CreateNotification :one
INSERT INTO notifications (user_id, type, title, body)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CreateNotificationsBulk :many
-- Fans the same event out to several recipients in one statement.
INSERT INTO notifications (user_id, type, title, body)
SELECT unnest(sqlc.arg(user_ids)::uuid[]), sqlc.arg(type), sqlc.arg(title), sqlc.arg(body)
RETURNING *;

-- name: GetNotificationByID :one
SELECT * FROM notifications WHERE id = $1;

-- name: ListNotifications :many
-- (NOT unread_only OR read_at IS NULL) makes unread_only a real filter when
-- true, and a no-op (all rows) when false, in one query.
SELECT * FROM notifications
WHERE user_id = $1 AND (NOT sqlc.arg(unread_only)::bool OR read_at IS NULL)
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: MarkNotificationRead :one
-- Preserves the original read_at if already read, rather than bumping it to
-- now() on every call -- matches the "no-op if already read" behavior.
UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 RETURNING *;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL;
