-- name: CreateEkub :one
INSERT INTO ekubs (name, currency, slot_amount, cadence, created_by_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetEkub :one
SELECT * FROM ekubs WHERE id = $1;

-- name: ListMyEkubs :many
-- Every ekub the user is in or invited to (not ones they left), with
-- their own membership and the number of people taking part.
SELECT sqlc.embed(e), m.status AS my_status, m.role AS my_role,
       (SELECT count(*) FROM ekub_members x
        WHERE x.ekub_id = e.id AND x.status <> 'INVITED')::int AS member_count
FROM ekubs e
JOIN ekub_members m ON m.ekub_id = e.id
WHERE m.user_id = $1 AND m.status <> 'LEFT'
ORDER BY e.created_at DESC;

-- name: StartEkub :one
UPDATE ekubs SET status = 'ACTIVE', start_date = $2
WHERE id = $1 AND status = 'DRAFT'
RETURNING *;

-- name: DeleteEkub :exec
DELETE FROM ekubs WHERE id = $1;

-- name: CreateEkubMember :one
INSERT INTO ekub_members (ekub_id, user_id, role, status, amount, slot_position)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetEkubMemberByUser :one
SELECT * FROM ekub_members WHERE ekub_id = $1 AND user_id = $2;

-- name: GetEkubMember :one
SELECT * FROM ekub_members WHERE id = $1 AND ekub_id = $2;

-- name: ListEkubMembers :many
SELECT m.*, p.display_name, p.avatar_url, p.username
FROM ekub_members m
JOIN profiles p ON p.id = m.user_id
WHERE m.ekub_id = $1
ORDER BY m.slot_position, m.created_at;

-- name: DeleteEkubMember :exec
DELETE FROM ekub_members WHERE id = $1;

-- name: SetEkubMemberStatus :one
UPDATE ekub_members SET status = $2 WHERE id = $1
RETURNING *;

-- name: SetEkubSlots :exec
-- The admin's new arrangement, in one statement so it lands whole.
UPDATE ekub_members m
SET slot_position = v.slot_position, amount = v.amount
FROM (SELECT unnest(@member_ids::uuid[]) AS id,
             unnest(@slot_positions::int[]) AS slot_position,
             unnest(@amounts::bigint[]) AS amount) v
WHERE m.id = v.id AND m.ekub_id = @ekub_id;

-- name: JoinStartedEkub :one
-- Someone invited after the start accepts: their slot goes in at
-- `slot_position` and every taking-part slot from there moves one round
-- later, in the same statement.
WITH shifted AS (
    UPDATE ekub_members s
    SET slot_position = s.slot_position + 1
    WHERE s.ekub_id = @ekub_id AND s.status <> 'INVITED' AND s.slot_position >= @slot_position
)
UPDATE ekub_members j
SET status = 'ACTIVE', slot_position = @slot_position, joined_round = @joined_round
WHERE j.id = @member_id
RETURNING j.*;

-- name: CreateEkubPayment :one
INSERT INTO ekub_payments (ekub_id, payer_member_id, recipient_member_id, amount, status, created_by_id, resolved_at)
VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5::ekub_payment_status = 'CONFIRMED' THEN now() END)
RETURNING *;

-- name: GetEkubPayment :one
SELECT * FROM ekub_payments WHERE id = $1 AND ekub_id = $2;

-- name: ListEkubPayments :many
SELECT * FROM ekub_payments
WHERE ekub_id = $1 AND status <> 'REJECTED'
ORDER BY created_at;

-- name: ResolveEkubPayment :one
-- Only a payment still waiting can be confirmed or turned down; no row
-- back means someone else got there first.
UPDATE ekub_payments SET status = $2, resolved_at = now()
WHERE id = $1 AND status = 'PENDING'
RETURNING *;
