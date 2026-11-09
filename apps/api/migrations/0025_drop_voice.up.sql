-- Voice commands are removed from ABRO (ADR-030, retiring ADR-027 and the
-- voice part of ADR-028). The tables 0024 added for them go too:
-- app_settings only ever held voice_mode, voice_access was the admin's
-- per-person switch, voice_sessions counted tokens handed out.
-- The usage history is dropped on purpose; nothing else reads it.

DROP TABLE voice_sessions;
DROP TABLE voice_access;
DROP TABLE app_settings;
