-- name: ListLateFeeGroups :many
-- Groups with late fees on (ADR-026).
SELECT id, name, currency, interest_rate_bp, interest_grace_days, interest_cap_bp, interest_since
FROM groups
WHERE deleted_at IS NULL AND interest_rate_bp > 0 AND interest_since IS NOT NULL;

-- name: MarkLateFeeDay :one
-- Claims today's charge for a member; no row back means it was already
-- charged today (a restart re-running the daily job).
INSERT INTO late_fee_days (group_id, debtor_id, day)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING
RETURNING day;

-- name: HasLateFeeDay :one
SELECT EXISTS (
    SELECT 1 FROM late_fee_days WHERE group_id = $1 AND debtor_id = $2 AND day = $3
);
