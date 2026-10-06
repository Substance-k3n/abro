-- Phase 8 slice 10 (docs/WIRING_PLAN.md) -- SET-02's per-type
-- notification preferences (user decision 2026-09-29). Stored as
-- opt-OUTs: a row means "don't create in-app notifications of this type
-- for this user"; no row means on, so every existing user keeps getting
-- everything without a backfill. `type` is notifications.Type
-- (EXPENSE_ADDED, ...), validated by the API rather than an enum so a
-- new type needs no migration.
CREATE TABLE notification_opt_outs (
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, type)
);
