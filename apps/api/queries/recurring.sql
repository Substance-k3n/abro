-- name: CreateRecurringExpense :one
INSERT INTO recurring_expenses (template_expense_id, frequency, next_run_at, enabled)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetRecurringExpenseByID :one
SELECT * FROM recurring_expenses WHERE id = $1;

-- name: ListMyRecurringExpenses :many
-- Every recurring template the user is involved in, same visibility rule
-- as expenses.Service.List's default view.
SELECT re.* FROM recurring_expenses re
JOIN expenses e ON e.id = re.template_expense_id
WHERE e.deleted_at IS NULL AND (
    (e.group_id IS NULL AND EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = $1))
    OR (e.group_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = e.group_id AND gm.user_id = $1 AND gm.status = 'ACTIVE'))
)
ORDER BY re.next_run_at ASC;

-- name: ListDueRecurringExpenses :many
SELECT * FROM recurring_expenses WHERE enabled = true AND next_run_at <= $1;

-- name: UpdateRecurringExpenseEnabled :one
UPDATE recurring_expenses SET enabled = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: UpdateRecurringExpenseNextRunAt :exec
UPDATE recurring_expenses SET next_run_at = $2, updated_at = now() WHERE id = $1;
