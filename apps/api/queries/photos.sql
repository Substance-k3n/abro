-- name: SetProfileAvatar :one
-- avatar_url is what clients show; avatar_path is the stored object.
-- Both NULL removes the photo.
UPDATE profiles
SET avatar_url = sqlc.narg('avatar_url'), avatar_path = sqlc.narg('avatar_path'), updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: SetGroupPhoto :one
UPDATE groups
SET photo_path = sqlc.narg('photo_path'), updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;
