-- Phone/browser push (ADR-021). push_subscriptions has existed since
-- 0007 (ported from the Prisma schema) but nothing used it until now.
-- keys is the browser's {"p256dh": ..., "auth": ...} as-is.

-- name: UpsertPushSubscription :one
-- An endpoint belongs to one browser profile: the same endpoint
-- re-subscribing (keys rotated, or another account signed in on that
-- device) replaces the row rather than adding a second one.
INSERT INTO push_subscriptions (user_id, endpoint, keys)
VALUES ($1, $2, $3)
ON CONFLICT (endpoint) DO UPDATE
SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys, updated_at = now()
RETURNING *;

-- name: DeletePushSubscription :exec
DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2;

-- name: DeletePushSubscriptionByEndpoint :exec
-- The push service said this endpoint is gone, whoever it belonged to.
DELETE FROM push_subscriptions WHERE endpoint = $1;

-- name: ListPushSubscriptionsForUsers :many
SELECT * FROM push_subscriptions WHERE user_id = ANY(sqlc.arg(user_ids)::uuid[]);
