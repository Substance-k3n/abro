-- name: CreateIdempotencyKey :one
-- Reservation, written before the guarded operation runs -- a concurrent
-- duplicate request fails fast on the unique constraint instead of racing
-- to run the operation twice.
INSERT INTO idempotency_keys (user_id, key, endpoint)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetIdempotencyKeyByUserKeyEndpoint :one
SELECT * FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND endpoint = $3;

-- name: SetIdempotencyKeyResponse :exec
UPDATE idempotency_keys SET response = $2 WHERE id = $1;

-- name: DeleteIdempotencyKey :exec
DELETE FROM idempotency_keys WHERE id = $1;
