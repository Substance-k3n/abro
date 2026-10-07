-- Expense disputes (phone-trial feedback 2026-10-07, ADR-020): a
-- participant can say "I wasn't part of this". It's a flag on their
-- share, nothing more: balances still count the expense exactly as
-- entered until the payer (or a group admin) edits or deletes it.
-- Editing rewrites the participant rows, which clears every dispute on
-- that expense along with them.
ALTER TABLE expense_participants ADD COLUMN disputed_at TIMESTAMPTZ;

-- A notification can point at the one thing it's about (e.g.
-- /expenses/<id>), so tapping it opens that screen. Older ones have none
-- and the app falls back to a screen per type.
ALTER TABLE notifications ADD COLUMN link TEXT;
