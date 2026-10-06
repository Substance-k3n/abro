-- name: GetPairwiseParticipantsPersonal :many
-- Personal-scope (group_id IS NULL) half of getPairwiseBalance's OR query.
SELECT ep.user_id, ep.amount FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE e.deleted_at IS NULL AND e.group_id IS NULL AND (
    (ep.user_id = sqlc.arg('user_b') AND e.paid_by_id = sqlc.arg('user_a'))
    OR (ep.user_id = sqlc.arg('user_a') AND e.paid_by_id = sqlc.arg('user_b'))
);

-- name: GetPairwiseParticipantsInGroup :many
SELECT ep.user_id, ep.amount FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE e.deleted_at IS NULL AND e.group_id = sqlc.arg('group_id') AND (
    (ep.user_id = sqlc.arg('user_b') AND e.paid_by_id = sqlc.arg('user_a'))
    OR (ep.user_id = sqlc.arg('user_a') AND e.paid_by_id = sqlc.arg('user_b'))
);

-- name: GetGroupPaidSums :many
SELECT paid_by_id, sum(amount)::bigint AS total FROM expenses
WHERE group_id = $1 AND deleted_at IS NULL
GROUP BY paid_by_id;

-- name: GetGroupOwedSums :many
SELECT ep.user_id, sum(ep.amount)::bigint AS total FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE e.group_id = $1 AND e.deleted_at IS NULL
GROUP BY ep.user_id;
