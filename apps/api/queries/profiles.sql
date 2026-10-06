-- name: GetProfileByID :one
SELECT * FROM profiles WHERE id = $1;

-- name: GetProfileByEmail :one
SELECT * FROM profiles WHERE email = $1;

-- name: GetProfileByUsername :one
-- Phase 8 (AUTH-05) -- backs the username-availability check.
SELECT * FROM profiles WHERE username = $1;

-- name: UpsertProfileByEmail :one
-- Mirrors Prisma's `upsert({ where: { email }, update: {}, create: {...} })`
-- -- a genuine no-op on conflict (the "id = profiles.id" self-assignment),
-- so an existing profile's fields are never touched by a repeat OTP sign-in.
INSERT INTO profiles (email, display_name)
VALUES ($1, $2)
ON CONFLICT (email) DO UPDATE SET id = profiles.id
RETURNING *;

-- name: UpsertProfileByEmailWithNameAvatar :one
-- Same no-op-on-conflict semantics as UpsertProfileByEmail, but also seeds
-- avatar_url on first insert (Google sign-in path).
INSERT INTO profiles (email, display_name, avatar_url)
VALUES ($1, $2, $3)
ON CONFLICT (email) DO UPDATE SET id = profiles.id
RETURNING *;

-- name: UpdateProfile :one
UPDATE profiles
SET display_name = COALESCE(sqlc.narg('display_name'), display_name),
    avatar_url = COALESCE(sqlc.narg('avatar_url'), avatar_url),
    username = COALESCE(sqlc.narg('username'), username),
    preferred_currency = COALESCE(sqlc.narg('preferred_currency'), preferred_currency),
    locale = COALESCE(sqlc.narg('locale'), locale),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;
