-- Site admin portal (ADR-028): a separate admin app (apps/admin) for
-- running ABRO itself, not a group. Three things it needs from the
-- database:
--
-- 1. site_admins -- who is a site admin and at what rank. A separate
--    table, not a profiles column: most profiles never have a role, and
--    every grant/revoke is a row change the audit log can point at.
--    Super admins named in ADMIN_EMAILS (Render) are admins without a
--    row, so nobody can lock the owner out from inside the app.
-- 2. admin_audit_log -- every admin action, append-only. actor_id is
--    SET NULL on delete so the log outlives the people in it; the target
--    is a type + id pair because actions hit users, sessions and roles.
-- 3. profiles.suspended_at -- a suspended account can't sign in and its
--    sessions stop working. A column, not a table, because the session
--    middleware already loads the profile on every request, so the check
--    costs nothing. Who suspended and why also lives in the audit log.

CREATE TYPE admin_role AS ENUM ('SUPPORT', 'ADMIN', 'SUPER_ADMIN');

CREATE TABLE site_admins (
    user_id    UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    role       admin_role NOT NULL,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   UUID,
    details     JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON admin_audit_log (target_id, created_at DESC);
CREATE INDEX admin_audit_log_actor_idx ON admin_audit_log (actor_id, created_at DESC);

ALTER TABLE profiles
    ADD COLUMN suspended_at      TIMESTAMPTZ,
    ADD COLUMN suspension_reason TEXT;
