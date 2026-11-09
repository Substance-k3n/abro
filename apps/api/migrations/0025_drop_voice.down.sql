-- Puts back the 0024 voice tables, empty.

CREATE TABLE app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE voice_access (
    user_id    UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE voice_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX voice_sessions_user_idx ON voice_sessions (user_id, created_at DESC);
CREATE INDEX voice_sessions_created_at_idx ON voice_sessions (created_at);
