-- Ported from apps/api/prisma/schema/auth.prisma. ADR-004's mechanism
-- (DB-backed sessions + Email OTP + Google OAuth) unchanged by ADR-007 --
-- only the implementation language changed.

CREATE TYPE oauth_provider AS ENUM ('GOOGLE');

-- Only the SHA-256 hash of the session token is ever stored -- the raw
-- token lives only in the client's httpOnly cookie.
CREATE TABLE sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    user_agent    TEXT,
    ip_address    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- One row per OTP send. code_hash only (never plaintext). Not linked to
-- profiles: the email may not have an account yet at send time.
CREATE TABLE otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_email_consumed_at_idx ON otp_codes (email, consumed_at);

CREATE TABLE oauth_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider            oauth_provider NOT NULL,
    provider_account_id TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_account_id)
);
CREATE INDEX oauth_accounts_user_id_idx ON oauth_accounts (user_id);
