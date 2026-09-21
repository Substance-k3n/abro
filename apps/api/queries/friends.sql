-- name: SearchFriendByEmailOrPhone :one
-- Exact match only -- never a fuzzy name search, so you can't browse the
-- user directory.
SELECT * FROM profiles
WHERE id != $1 AND (email = $2 OR phone = $2)
LIMIT 1;

-- name: ListFriendships :many
SELECT
    f.id AS friendship_id,
    f.created_at AS since,
    f.user_id,
    f.friend_id,
    u.display_name AS user_display_name,
    u.avatar_url AS user_avatar_url,
    u.email AS user_email,
    u.preferred_currency AS user_preferred_currency,
    u.locale AS user_locale,
    fr.display_name AS friend_display_name,
    fr.avatar_url AS friend_avatar_url,
    fr.email AS friend_email,
    fr.preferred_currency AS friend_preferred_currency,
    fr.locale AS friend_locale
FROM friendships f
JOIN profiles u ON u.id = f.user_id
JOIN profiles fr ON fr.id = f.friend_id
WHERE f.status = 'ACCEPTED' AND (f.user_id = $1 OR f.friend_id = $1)
ORDER BY f.created_at DESC;

-- name: ListIncomingFriendRequests :many
SELECT
    f.id AS friendship_id,
    f.created_at AS sent_at,
    u.id AS from_id,
    u.display_name AS from_display_name,
    u.avatar_url AS from_avatar_url,
    u.email AS from_email,
    u.preferred_currency AS from_preferred_currency,
    u.locale AS from_locale
FROM friendships f
JOIN profiles u ON u.id = f.user_id
WHERE f.friend_id = $1 AND f.status = 'PENDING'
ORDER BY f.created_at DESC;

-- name: GetFriendshipByID :one
SELECT * FROM friendships WHERE id = $1;

-- name: FindFriendshipBetween :one
SELECT * FROM friendships
WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
LIMIT 1;

-- name: CreateFriendship :one
INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2) RETURNING *;

-- name: AcceptFriendship :one
UPDATE friendships SET status = 'ACCEPTED' WHERE id = $1 RETURNING *;

-- name: DeleteFriendship :exec
DELETE FROM friendships WHERE id = $1;
