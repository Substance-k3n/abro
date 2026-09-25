-- name: CreateExpense :one
INSERT INTO expenses (group_id, name, category, amount, currency, paid_by_id, split_type, expense_date, receipt_path, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CreateExpenseParticipant :one
INSERT INTO expense_participants (expense_id, user_id, amount)
VALUES ($1, $2, $3)
RETURNING *;

-- name: DeleteExpenseParticipants :exec
DELETE FROM expense_participants WHERE expense_id = $1;

-- name: UpdateExpense :one
-- Editing an expense resubmits the whole thing -- a full overwrite, not a
-- partial COALESCE update (see updateExpenseSchema == createExpenseSchema).
UPDATE expenses SET
    group_id = $2, name = $3, category = $4, amount = $5, currency = $6,
    paid_by_id = $7, split_type = $8, expense_date = $9, receipt_path = $10,
    notes = $11, updated_by_id = $12, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: SoftDeleteExpense :exec
UPDATE expenses SET deleted_at = now(), deleted_by_id = $2 WHERE id = $1;

-- name: GetExpenseByID :one
SELECT * FROM expenses WHERE id = $1;

-- name: GetExpenseParticipant :one
SELECT * FROM expense_participants WHERE expense_id = $1 AND user_id = $2;

-- name: ListExpenseParticipantsForExpenseIDs :many
SELECT ep.expense_id, ep.id, ep.user_id, ep.amount,
       p.display_name, p.avatar_url, p.email, p.preferred_currency, p.locale
FROM expense_participants ep
JOIN profiles p ON p.id = ep.user_id
WHERE ep.expense_id = ANY(sqlc.arg('expense_ids')::uuid[]);

-- name: ListMyExpenses :many
-- All three expense list queries order by (expense_date, created_at, id)
-- DESC: expense_date alone isn't unique (same-day expenses are common),
-- and LIMIT/OFFSET paging over a non-total order can skip or repeat rows
-- across pages. created_at puts later-entered same-day expenses first;
-- id makes the order total.
-- Personal (non-group) expenses the actor participates in, plus every
-- expense in a group the actor is an ACTIVE member of.
SELECT * FROM expenses e
WHERE e.deleted_at IS NULL AND (
    (e.group_id IS NULL AND EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = $1))
    OR (e.group_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = e.group_id AND gm.user_id = $1 AND gm.status = 'ACTIVE'))
)
ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
LIMIT $2 OFFSET $3;

-- name: ListExpensesByGroup :many
SELECT * FROM expenses WHERE group_id = $1 AND deleted_at IS NULL
ORDER BY expense_date DESC, created_at DESC, id DESC
LIMIT $2 OFFSET $3;

-- name: ListExpensesWithFriend :many
-- Personal (non-group) expenses shared between the actor and a specific
-- friend -- ABRO_PRD.md §22 "Friend Balance" history list.
SELECT e.* FROM expenses e
WHERE e.group_id IS NULL AND e.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = $1)
  AND EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = $2)
ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
LIMIT $3 OFFSET $4;

-- name: CreateExpenseNote :one
INSERT INTO expense_notes (expense_id, author_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListExpenseNotesWithAuthor :many
SELECT n.id, n.expense_id, n.content, n.created_at,
       p.id AS author_id, p.display_name AS author_display_name, p.avatar_url AS author_avatar_url,
       p.email AS author_email, p.preferred_currency AS author_preferred_currency, p.locale AS author_locale
FROM expense_notes n
JOIN profiles p ON p.id = n.author_id
WHERE n.expense_id = $1
ORDER BY n.created_at ASC;

-- name: UpdateExpenseReceiptPath :one
UPDATE expenses SET receipt_path = $2 WHERE id = $1 RETURNING *;
