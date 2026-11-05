ALTER TABLE profiles
    DROP COLUMN suspension_reason,
    DROP COLUMN suspended_at;

DROP TABLE admin_audit_log;
DROP TABLE site_admins;
DROP TYPE admin_role;
