-- Admin portal, part 2 (ADR-028): voice access moves from a Render
-- variable to something an admin controls, and voice use becomes visible.
--
-- app_settings -- small switches an admin flips without a deploy, one
--   row per key. Only voice_mode for now: 'off' (nobody, a kill switch),
--   'listed' (VOICE_TESTERS plus voice_access, the default with no row),
--   'everyone'.
-- voice_access -- people an admin turned voice on for. VOICE_TESTERS
--   still counts in 'listed' mode, so nobody loses voice on deploy.
-- voice_sessions -- one row per token the API hands out (a voice session
--   starting). Tells admins who uses voice and how much, without storing
--   anything that was said.

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
