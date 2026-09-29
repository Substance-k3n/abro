-- Phase 8 slice 8 (docs/WIRING_PLAN.md) -- GRP-07's "Delete group".
-- A soft delete, same shape as expenses.deleted_at/deleted_by_id: the
-- group's expenses are financial facts and stay in place. apps/api only
-- lets the creator delete, and only once every member's net in the
-- group is 0, so no balance is lost. From then on the group reads as not
-- found everywhere (GetGroupByID/GetGroupMember and the list queries
-- filter on deleted_at IS NULL).
ALTER TABLE groups
    ADD COLUMN deleted_at    TIMESTAMPTZ,
    ADD COLUMN deleted_by_id UUID REFERENCES profiles(id);
