-- Site admin portal (ADR-028). Everything an admin can see about a person
-- is counts and account facts -- never balances, expense names or
-- receipts (user decision 2026-11-05: admins see no one's money).
--
-- owner_emails is ADMIN_EMAILS from config: those people are super
-- admins without a site_admins row, so the role shown here is the
-- effective one.

-- name: GetSiteAdmin :one
SELECT * FROM site_admins WHERE user_id = $1;

-- name: ListSiteAdmins :many
-- Admins with a stored role. Super admins from ADMIN_EMAILS are added by
-- the service (ListOwnerProfiles).
SELECT r.user_id, r.role, r.granted_at,
       p.display_name, p.email, p.username, p.avatar_url,
       g.display_name AS granted_by_name
FROM site_admins r
JOIN profiles p ON p.id = r.user_id
LEFT JOIN profiles g ON g.id = r.granted_by
ORDER BY r.role DESC, p.display_name;

-- name: ListOwnerProfiles :many
SELECT * FROM profiles WHERE email = ANY(sqlc.arg('owner_emails')::text[]) ORDER BY display_name;

-- name: UpsertSiteAdmin :one
INSERT INTO site_admins (user_id, role, granted_by)
VALUES (@user_id, @role, @granted_by)
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, granted_at = now()
RETURNING *;

-- name: DeleteSiteAdmin :execrows
DELETE FROM site_admins WHERE user_id = $1;

-- name: InsertAdminAudit :exec
INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, details, ip_address)
VALUES (@actor_id, @action, @target_type, @target_id, @details, @ip_address);

-- name: ListAdminAudit :many
-- Newest first, keyset-paged on (created_at, id) -- the last row of the
-- previous page -- so rows sharing a timestamp are never skipped. Every
-- filter is optional.
SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.details,
       a.ip_address, a.created_at,
       actor.display_name AS actor_name, actor.email AS actor_email,
       target.display_name AS target_name, target.email AS target_email
FROM admin_audit_log a
LEFT JOIN profiles actor ON actor.id = a.actor_id
LEFT JOIN profiles target ON target.id = a.target_id AND a.target_type = 'user'
WHERE (sqlc.narg('actor_id')::uuid IS NULL OR a.actor_id = sqlc.narg('actor_id'))
  AND (sqlc.narg('target_id')::uuid IS NULL OR a.target_id = sqlc.narg('target_id'))
  AND (sqlc.narg('action')::text IS NULL OR a.action = sqlc.narg('action'))
  AND (sqlc.narg('before')::timestamptz IS NULL
       OR (a.created_at, a.id) < (sqlc.narg('before')::timestamptz, sqlc.narg('before_id')::uuid))
ORDER BY a.created_at DESC, a.id DESC
LIMIT @lim;

-- name: AdminListUsers :many
-- One page of people, newest first. `search` matches name, email or
-- username (the caller escapes % and _); `status` is NULL (everyone),
-- 'active', 'suspended' or 'admins'.
SELECT p.id, p.display_name, p.email, p.username, p.avatar_url,
       p.created_at, p.suspended_at,
       COALESCE(CASE WHEN p.email = ANY(sqlc.arg('owner_emails')::text[]) THEN 'SUPER_ADMIN'
                     ELSE r.role::text END, '')::text AS admin_role,
       (SELECT max(s.last_used_at) FROM sessions s WHERE s.user_id = p.id)::timestamptz AS last_active_at,
       (SELECT count(*) FROM group_members gm JOIN groups g ON g.id = gm.group_id
         WHERE gm.user_id = p.id AND gm.status = 'ACTIVE' AND g.deleted_at IS NULL) AS group_count,
       count(*) OVER () AS total
FROM profiles p
LEFT JOIN site_admins r ON r.user_id = p.id
WHERE (sqlc.narg('search')::text IS NULL
       OR p.display_name ILIKE '%' || sqlc.narg('search') || '%'
       OR p.email ILIKE '%' || sqlc.narg('search') || '%'
       OR p.username ILIKE '%' || sqlc.narg('search') || '%')
  AND (sqlc.narg('status')::text IS NULL
       OR (sqlc.narg('status') = 'active' AND p.suspended_at IS NULL)
       OR (sqlc.narg('status') = 'suspended' AND p.suspended_at IS NOT NULL)
       OR (sqlc.narg('status') = 'admins'
           AND (r.role IS NOT NULL OR p.email = ANY(sqlc.arg('owner_emails')::text[]))))
ORDER BY p.created_at DESC, p.id
LIMIT @lim OFFSET @off;

-- name: AdminUserCounts :one
-- What one person has in the app, as counts. Settlements are payments,
-- not expenses, so they're counted apart.
SELECT
  (SELECT count(*) FROM group_members gm JOIN groups g ON g.id = gm.group_id
    WHERE gm.user_id = @user_id AND gm.status = 'ACTIVE' AND g.deleted_at IS NULL) AS group_count,
  (SELECT count(*) FROM friendships f
    WHERE (f.user_id = @user_id OR f.friend_id = @user_id) AND f.status = 'ACCEPTED') AS friend_count,
  (SELECT count(DISTINCT e.id) FROM expenses e
    LEFT JOIN expense_participants ep ON ep.expense_id = e.id AND ep.user_id = @user_id
    WHERE e.deleted_at IS NULL AND e.split_type <> 'SETTLEMENT'
      AND (e.paid_by_id = @user_id OR ep.user_id IS NOT NULL)) AS expense_count,
  (SELECT count(DISTINCT e.id) FROM expenses e
    LEFT JOIN expense_participants ep ON ep.expense_id = e.id AND ep.user_id = @user_id
    WHERE e.deleted_at IS NULL AND e.split_type = 'SETTLEMENT'
      AND (e.paid_by_id = @user_id OR ep.user_id IS NOT NULL)) AS settlement_count,
  (SELECT max(s.last_used_at) FROM sessions s WHERE s.user_id = @user_id)::timestamptz AS last_active_at;

-- name: AdminListUserSessions :many
-- Live sessions first, then the most recent ended ones.
SELECT id, user_agent, ip_address, created_at, last_used_at, expires_at, revoked_at,
       (revoked_at IS NULL AND expires_at > now())::boolean AS live
FROM sessions
WHERE user_id = $1
ORDER BY (revoked_at IS NULL AND expires_at > now()) DESC, last_used_at DESC
LIMIT 20;

-- name: AdminListUserGroups :many
-- Groups by name, role and size only -- no amounts.
SELECT g.id, g.name, g.type, gm.role, gm.status, gm.joined_at, g.deleted_at,
       (SELECT count(*) FROM group_members m WHERE m.group_id = g.id AND m.status = 'ACTIVE') AS member_count
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.user_id = $1
ORDER BY g.deleted_at IS NULL DESC, gm.joined_at DESC
LIMIT 50;

-- name: SuspendProfile :one
-- Only an active account: suspending twice is a 409, not a new row.
UPDATE profiles
SET suspended_at = now(), suspension_reason = @reason, updated_at = now()
WHERE id = @id AND suspended_at IS NULL
RETURNING *;

-- name: UnsuspendProfile :one
UPDATE profiles
SET suspended_at = NULL, suspension_reason = NULL, updated_at = now()
WHERE id = $1 AND suspended_at IS NOT NULL
RETURNING *;

-- name: RevokeAllUserSessions :execrows
UPDATE sessions SET revoked_at = now()
WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now();

-- name: RevokeUserSession :execrows
UPDATE sessions SET revoked_at = now()
WHERE id = @id AND user_id = @user_id AND revoked_at IS NULL AND expires_at > now();
