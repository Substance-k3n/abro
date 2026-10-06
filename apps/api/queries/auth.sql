-- name: GetRecentOtpCode :one
-- Cooldown check: most recent OTP sent for this email since `since`.
SELECT * FROM otp_codes
WHERE email = $1 AND created_at > $2
ORDER BY created_at DESC
LIMIT 1;

-- name: CreateOtpCode :one
INSERT INTO otp_codes (email, code_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetLatestUnconsumedOtpCode :one
SELECT * FROM otp_codes
WHERE email = $1 AND consumed_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: IncrementOtpAttempts :exec
UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1;

-- name: ConsumeOtpCode :exec
UPDATE otp_codes SET consumed_at = now() WHERE id = $1;

-- name: GetOAuthAccountByProvider :one
SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_account_id = $2;

-- name: CreateOAuthAccount :one
INSERT INTO oauth_accounts (user_id, provider, provider_account_id)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateSession :one
INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetSessionByTokenHash :one
SELECT * FROM sessions WHERE token_hash = $1;

-- name: TouchSessionLastUsed :exec
UPDATE sessions SET last_used_at = now() WHERE id = $1;

-- name: RevokeSessionsByTokenHash :exec
UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL;
