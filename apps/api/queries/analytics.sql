-- Read-only aggregation over expenses/expense_participants -- ABRO_PRD.md
-- §26. All queries exclude soft-deleted expenses and SETTLEMENT-type rows
-- (settlements are reported separately, to avoid double-counting a debt
-- transfer as new "spending").

-- name: GetUserTotals :one
-- Total Spending / Your Contribution / Your Share / amount owed for the
-- period.
WITH involved AS (
    SELECT DISTINCT e.id, e.amount
    FROM expenses e
    LEFT JOIN expense_participants ep ON ep.expense_id = e.id AND ep.user_id = sqlc.arg('user_id')
    WHERE e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
      AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
      AND (e.paid_by_id = sqlc.arg('user_id') OR ep.user_id = sqlc.arg('user_id'))
)
SELECT
    COALESCE((SELECT sum(amount) FROM involved), 0)::bigint AS total_spending,
    COALESCE((
        SELECT sum(e.amount) FROM expenses e
        WHERE e.paid_by_id = sqlc.arg('user_id') AND e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
          AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
    ), 0)::bigint AS your_contribution,
    COALESCE((
        SELECT sum(ep.amount) FROM expense_participants ep JOIN expenses e ON e.id = ep.expense_id
        WHERE ep.user_id = sqlc.arg('user_id') AND e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
          AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
    ), 0)::bigint AS your_share,
    COALESCE((
        SELECT sum(ep.amount) FROM expense_participants ep JOIN expenses e ON e.id = ep.expense_id
        WHERE ep.user_id = sqlc.arg('user_id') AND e.paid_by_id != sqlc.arg('user_id')
          AND e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
          AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
    ), 0)::bigint AS amount_owed;

-- name: GetCategoryBreakdown :many
SELECT e.category, sum(e.amount)::bigint AS amount
FROM expenses e
WHERE e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
  AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
  AND (e.paid_by_id = sqlc.arg('user_id')
       OR EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = sqlc.arg('user_id')))
GROUP BY e.category;

-- name: GetGroupSpending :many
-- Only groups with actual matching spending appear (an INNER JOIN to
-- expenses naturally excludes an active membership with zero spend in
-- the period, same as the original's post-hoc "> 0" filter).
SELECT g.id AS group_id, g.name AS group_name, sum(e.amount)::bigint AS total_spending
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
JOIN expenses e ON e.group_id = g.id
WHERE gm.user_id = sqlc.arg('user_id') AND gm.status = 'ACTIVE'
  AND e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
  AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
  AND (e.paid_by_id = sqlc.arg('user_id')
       OR EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = sqlc.arg('user_id')))
GROUP BY g.id, g.name;

-- name: GetMonthlyTrendRaw :many
-- Only months with matching spending are returned; the caller fills the
-- other months of the year with zero.
SELECT EXTRACT(MONTH FROM e.expense_date)::int AS month, sum(e.amount)::bigint AS total_spending
FROM expenses e
WHERE e.split_type != 'SETTLEMENT' AND e.deleted_at IS NULL
  AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date')
  AND (e.paid_by_id = sqlc.arg('user_id')
       OR EXISTS (SELECT 1 FROM expense_participants ep WHERE ep.expense_id = e.id AND ep.user_id = sqlc.arg('user_id')))
GROUP BY EXTRACT(MONTH FROM e.expense_date);

-- name: GetSettlementsPaid :one
-- direction "paid": settlements the user initiated (paid_by_id = user).
SELECT COALESCE(sum(amount), 0)::bigint FROM expenses
WHERE paid_by_id = sqlc.arg('user_id') AND split_type = 'SETTLEMENT' AND deleted_at IS NULL
  AND expense_date >= sqlc.arg('start_date') AND expense_date < sqlc.arg('end_date');

-- name: GetSettlementsReceived :one
-- direction "received": settlements where the user is the recipient
-- participant (see settlements.Service -- recipient's amount carries the
-- settled amount, payer's is always 0).
SELECT COALESCE(sum(ep.amount), 0)::bigint
FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE ep.user_id = sqlc.arg('user_id') AND ep.amount > 0 AND e.paid_by_id != sqlc.arg('user_id')
  AND e.split_type = 'SETTLEMENT' AND e.deleted_at IS NULL
  AND e.expense_date >= sqlc.arg('start_date') AND e.expense_date < sqlc.arg('end_date');
