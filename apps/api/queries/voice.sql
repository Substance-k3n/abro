-- Voice access (ADR-027, admin-controlled since ADR-028).

-- name: GetAppSetting :one
SELECT value FROM app_settings WHERE key = $1;

-- name: UpsertAppSetting :exec
INSERT INTO app_settings (key, value, updated_by)
VALUES (@key, @value, @updated_by)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

-- name: HasVoiceAccess :one
SELECT EXISTS (SELECT 1 FROM voice_access WHERE user_id = $1);

-- name: RecordVoiceSession :exec
INSERT INTO voice_sessions (user_id) VALUES ($1);
