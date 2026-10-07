-- name: CreateSettlementRequest :one
INSERT INTO settlement_requests (payer_id, recipient_id, group_id, amount, currency)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetSettlementRequest :one
SELECT * FROM settlement_requests WHERE id = $1;

-- name: SumPendingSettlementRequests :one
-- What the payer has already claimed to have paid this recipient in the
-- same scope (personal = group_id NULL) and is still waiting on, so a
-- new claim can't add up past what they owe.
SELECT COALESCE(sum(amount), 0)::bigint FROM settlement_requests
WHERE payer_id = $1 AND recipient_id = $2 AND status = 'PENDING'
  AND group_id IS NOT DISTINCT FROM sqlc.narg('group_id');

-- name: ListSettlementRequestsForUser :many
-- Pending requests where the user is the payer or the recipient, plus
-- those resolved in the last 30 days, newest first.
SELECT * FROM settlement_requests
WHERE (payer_id = $1 OR recipient_id = $1)
  AND (status = 'PENDING' OR resolved_at > now() - interval '30 days')
ORDER BY (status = 'PENDING') DESC, created_at DESC
LIMIT 100;

-- name: ResolveSettlementRequest :one
-- Only a PENDING request can be resolved, in one atomic step: no row back
-- means someone got there first (it was already confirmed, rejected or
-- cancelled). Confirming claims the request this way before the
-- SETTLEMENT expense is written, so it can never be confirmed twice.
UPDATE settlement_requests
SET status = $2, resolved_at = now()
WHERE id = $1 AND status = 'PENDING'
RETURNING *;

-- name: LinkSettlementRequest :one
UPDATE settlement_requests SET settlement_id = $2 WHERE id = $1 RETURNING *;

-- name: ReopenSettlementRequest :exec
-- Undoes a confirm claim when writing the settlement failed.
UPDATE settlement_requests SET status = 'PENDING', resolved_at = NULL
WHERE id = $1 AND settlement_id IS NULL;

-- name: UpdateSettlementRequestReceiptPath :one
UPDATE settlement_requests SET receipt_path = $2 WHERE id = $1 RETURNING *;
