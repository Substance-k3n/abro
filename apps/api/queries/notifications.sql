-- name: CreateNotification :one
INSERT INTO notifications (user_id, type, title, body)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CreateNotificationsBulk :many
-- Fans the same event out to several recipients in one statement,
-- skipping anyone who opted out of this type (notification_opt_outs).
INSERT INTO notifications (user_id, type, title, body)
SELECT r.user_id, sqlc.arg(type), sqlc.arg(title), sqlc.arg(body)
FROM unnest(sqlc.arg(user_ids)::uuid[]) AS r(user_id)
WHERE NOT EXISTS (
    SELECT 1 FROM notification_opt_outs o
    WHERE o.user_id = r.user_id AND o.type = sqlc.arg(type)
)
RETURNING *;

-- name: IsNotificationOptedOut :one
SELECT EXISTS (
    SELECT 1 FROM notification_opt_outs WHERE user_id = $1 AND type = $2
);

-- name: ListNotificationOptOuts :many
SELECT type FROM notification_opt_outs WHERE user_id = $1;

-- name: AddNotificationOptOut :exec
INSERT INTO notification_opt_outs (user_id, type) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveNotificationOptOut :exec
DELETE FROM notification_opt_outs WHERE user_id = $1 AND type = $2;

-- name: GetNotificationByID :one
SELECT * FROM notifications WHERE id = $1;

-- name: ListNotifications :many
-- (NOT unread_only OR read_at IS NULL) makes unread_only a real filter when
-- true, and a no-op (all rows) when false, in one query.
SELECT * FROM notifications
WHERE user_id = $1 AND (NOT sqlc.arg(unread_only)::bool OR read_at IS NULL)
ORDER BY created_at DESC, id DESC -- id: total order for stable paging
LIMIT $2 OFFSET $3;

-- name: MarkNotificationRead :one
-- Preserves the original read_at if already read, rather than bumping it to
-- now() on every call -- matches the "no-op if already read" behavior.
UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 RETURNING *;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL;
