-- name: CreateGroup :one
INSERT INTO groups (name, type, currency, description, simplify_debts, created_by_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateGroupMember :one
INSERT INTO group_members (group_id, user_id, role, status)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListMyActiveGroups :many
SELECT g.* FROM groups g
JOIN group_members gm ON gm.group_id = g.id
WHERE gm.user_id = $1 AND gm.status = 'ACTIVE'
ORDER BY g.created_at DESC;

-- name: ListMyActiveGroupsWithStats :many
-- Same rows as ListMyActiveGroups, plus the two per-group values the
-- DASH-05 Groups list shows on every card: how many ACTIVE members the
-- group has (INVITED/LEFT don't count), and when its most recent
-- non-deleted expense was recorded (created_at, not the user-chosen,
-- possibly backdated expense_date), falling back to the group's own
-- created_at for a group with no expenses yet. Correlated subqueries
-- rather than a GROUP BY so the embedded groups row stays intact.
SELECT sqlc.embed(g),
       (SELECT count(*) FROM group_members m
        WHERE m.group_id = g.id AND m.status = 'ACTIVE')::int AS member_count,
       COALESCE((SELECT max(e.created_at) FROM expenses e
                 WHERE e.group_id = g.id AND e.deleted_at IS NULL),
                g.created_at)::timestamptz AS last_activity_at
FROM groups g
JOIN group_members gm ON gm.group_id = g.id
WHERE gm.user_id = $1 AND gm.status = 'ACTIVE'
ORDER BY g.created_at DESC;

-- name: ListMyInvites :many
SELECT gm.joined_at AS invited_at, g.*
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.user_id = $1 AND gm.status = 'INVITED'
ORDER BY gm.joined_at DESC;

-- name: GetGroupByID :one
SELECT * FROM groups WHERE id = $1;

-- name: GetGroupMember :one
SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2;

-- name: ListGroupMembersWithProfiles :many
SELECT gm.id, gm.group_id, gm.user_id, gm.role, gm.status, gm.joined_at,
       p.display_name, p.avatar_url, p.email, p.preferred_currency, p.locale
FROM group_members gm
JOIN profiles p ON p.id = gm.user_id
WHERE gm.group_id = $1
ORDER BY gm.joined_at ASC;

-- name: UpdateGroup :one
UPDATE groups
SET name = COALESCE(sqlc.narg('name'), name),
    type = COALESCE(sqlc.narg('type'), type),
    currency = COALESCE(sqlc.narg('currency'), currency),
    description = COALESCE(sqlc.narg('description'), description),
    simplify_debts = COALESCE(sqlc.narg('simplify_debts'), simplify_debts),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: UpdateGroupMemberStatus :one
UPDATE group_members SET status = $2 WHERE id = $1 RETURNING *;

-- name: ReinviteGroupMember :one
-- joined_at doubles as invitedAt for ListMyInvites -- reset it so a
-- re-invite after leaving shows up as a fresh invite, not the stale
-- timestamp/ordering from the original membership.
UPDATE group_members
SET status = 'INVITED', role = 'MEMBER', joined_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateGroupMemberRole :one
UPDATE group_members SET role = $2 WHERE id = $1 RETURNING *;

-- name: CountActiveAdminsExcept :one
SELECT count(*) FROM group_members
WHERE group_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE' AND user_id != $2;

-- name: ListActiveMemberIDsExcept :many
SELECT user_id FROM group_members
WHERE group_id = $1 AND status = 'ACTIVE' AND user_id != $2;
