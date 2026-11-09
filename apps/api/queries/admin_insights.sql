-- Admin portal overview and groups (ADR-028). App-wide counts
-- and totals only: nothing here says what one person owes or spent.
-- Days are Addis Ababa calendar days, where ABRO's people live.

-- name: AdminOverviewCounts :one
SELECT
  (SELECT count(*) FROM profiles p1) AS users_total,
  (SELECT count(*) FROM profiles p2 WHERE p2.created_at >= sqlc.arg('since')::timestamptz) AS users_new,
  (SELECT count(DISTINCT s.user_id) FROM sessions s WHERE s.last_used_at >= sqlc.arg('since')::timestamptz) AS users_active,
  (SELECT count(*) FROM profiles p3 WHERE p3.suspended_at IS NOT NULL) AS users_suspended,
  (SELECT count(*) FROM groups g1 WHERE g1.deleted_at IS NULL) AS groups_total,
  (SELECT count(*) FROM groups g2 WHERE g2.deleted_at IS NULL
     AND g2.created_at >= sqlc.arg('since')::timestamptz) AS groups_new,
  (SELECT count(*) FROM expenses e1 WHERE e1.deleted_at IS NULL AND e1.split_type <> 'SETTLEMENT'
     AND e1.created_at >= sqlc.arg('since')::timestamptz) AS expenses_new,
  (SELECT count(*) FROM expenses e2 WHERE e2.deleted_at IS NULL AND e2.split_type = 'SETTLEMENT'
     AND e2.created_at >= sqlc.arg('since')::timestamptz) AS settlements_new,
  (SELECT count(*) FROM expense_participants ep JOIN expenses e3 ON e3.id = ep.expense_id
     WHERE ep.disputed_at IS NOT NULL AND e3.deleted_at IS NULL) AS open_disputes,
  (SELECT count(*) FROM settlement_requests r1 WHERE r1.status = 'PENDING') AS pending_confirmations,
  (SELECT count(*) FROM settlement_requests r2 WHERE r2.status = 'PENDING'
     AND r2.created_at < now() - interval '7 days') AS stale_confirmations,
  (SELECT count(*) FROM group_members m1 JOIN groups g3 ON g3.id = m1.group_id
     WHERE m1.status = 'INVITED' AND g3.deleted_at IS NULL) AS pending_invites,
  (SELECT count(*) FROM group_members m2 JOIN groups g4 ON g4.id = m2.group_id
     WHERE m2.status = 'INVITED' AND g4.deleted_at IS NULL
       AND m2.joined_at < now() - interval '7 days') AS stale_invites;

-- name: AdminDailySeries :many
-- One row per day from `since` to today, zeros included.
WITH days AS (
  SELECT generate_series(
    (sqlc.arg('since')::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date,
    (now() AT TIME ZONE 'Africa/Addis_Ababa')::date,
    interval '1 day')::date AS day
)
SELECT d.day::date AS day,
  (SELECT count(*) FROM profiles p
     WHERE (p.created_at AT TIME ZONE 'Africa/Addis_Ababa')::date = d.day) AS signups,
  (SELECT count(*) FROM expenses e
     WHERE e.deleted_at IS NULL AND e.split_type <> 'SETTLEMENT'
       AND (e.created_at AT TIME ZONE 'Africa/Addis_Ababa')::date = d.day) AS expenses,
  (SELECT count(*) FROM expenses e
     WHERE e.deleted_at IS NULL AND e.split_type = 'SETTLEMENT'
       AND (e.created_at AT TIME ZONE 'Africa/Addis_Ababa')::date = d.day) AS settlements
FROM days d
ORDER BY d.day;

-- name: AdminExpenseCategories :many
SELECT category, count(*) AS expenses
FROM expenses
WHERE deleted_at IS NULL AND split_type <> 'SETTLEMENT' AND created_at >= sqlc.arg('since')::timestamptz
GROUP BY category
ORDER BY count(*) DESC, category;

-- name: AdminVolumeByCurrency :many
-- App-wide spending per currency in the range (minor units). Never per
-- person.
SELECT currency, sum(amount)::bigint AS total, count(*) AS expenses
FROM expenses
WHERE deleted_at IS NULL AND split_type <> 'SETTLEMENT' AND created_at >= sqlc.arg('since')::timestamptz
GROUP BY currency
ORDER BY sum(amount) DESC;

-- name: AdminGroupTypes :many
SELECT type, count(*) AS groups
FROM groups
WHERE deleted_at IS NULL
GROUP BY type
ORDER BY count(*) DESC, type;

-- name: AdminListGroups :many
-- `status`: NULL (live groups), 'deleted', or 'all'.
SELECT g.id, g.name, g.type, g.currency, g.created_at, g.deleted_at,
       c.display_name AS creator_name, g.created_by_id,
       (SELECT count(*) FROM group_members m WHERE m.group_id = g.id AND m.status = 'ACTIVE') AS member_count,
       (SELECT count(*) FROM group_members m WHERE m.group_id = g.id AND m.status = 'INVITED') AS invited_count,
       (SELECT count(*) FROM expenses e WHERE e.group_id = g.id AND e.deleted_at IS NULL
          AND e.split_type <> 'SETTLEMENT') AS expense_count,
       (SELECT max(e.created_at) FROM expenses e WHERE e.group_id = g.id AND e.deleted_at IS NULL)::timestamptz AS last_activity_at,
       count(*) OVER () AS total
FROM groups g
JOIN profiles c ON c.id = g.created_by_id
WHERE (sqlc.narg('search')::text IS NULL OR g.name ILIKE '%' || sqlc.narg('search') || '%')
  AND CASE COALESCE(sqlc.narg('status')::text, '')
        WHEN 'deleted' THEN g.deleted_at IS NOT NULL
        WHEN 'all' THEN true
        ELSE g.deleted_at IS NULL
      END
ORDER BY g.created_at DESC, g.id
LIMIT @lim OFFSET @off;

-- name: AdminGetGroup :one
SELECT g.id, g.name, g.type, g.currency, g.description, g.created_at, g.deleted_at,
       g.created_by_id, c.display_name AS creator_name,
       (SELECT count(*) FROM expenses e WHERE e.group_id = g.id AND e.deleted_at IS NULL
          AND e.split_type <> 'SETTLEMENT') AS expense_count,
       (SELECT count(*) FROM expenses e WHERE e.group_id = g.id AND e.deleted_at IS NULL
          AND e.split_type = 'SETTLEMENT') AS settlement_count,
       (SELECT max(e.created_at) FROM expenses e WHERE e.group_id = g.id AND e.deleted_at IS NULL)::timestamptz AS last_activity_at
FROM groups g
JOIN profiles c ON c.id = g.created_by_id
WHERE g.id = $1;

-- name: AdminGroupMembers :many
SELECT p.id, p.display_name, p.email, p.username, p.avatar_url, p.suspended_at,
       gm.role, gm.status, gm.joined_at
FROM group_members gm
JOIN profiles p ON p.id = gm.user_id
WHERE gm.group_id = $1
-- Active members first (the enum's own order puts INVITED first), admins
-- before members.
ORDER BY gm.status = 'ACTIVE' DESC, gm.status, gm.role, p.display_name;
