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

-- name: GetGroupPairOwedSums :many
-- What each participant owes each payer across a group's live expenses
-- (settlements included: the payer of a settlement is the debtor, so it
-- nets back). Feeds GetRawGroupDebts' "who owes whom" list.
SELECT ep.user_id AS debtor_id, e.paid_by_id AS creditor_id, sum(ep.amount)::bigint AS total
FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE e.group_id = $1 AND e.deleted_at IS NULL AND ep.user_id <> e.paid_by_id
GROUP BY ep.user_id, e.paid_by_id;

-- name: GetGroupPaidSums :many
SELECT paid_by_id, sum(amount)::bigint AS total FROM expenses
WHERE group_id = $1 AND deleted_at IS NULL
GROUP BY paid_by_id;

-- name: GetGroupOwedSums :many
SELECT ep.user_id, sum(ep.amount)::bigint AS total FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE e.group_id = $1 AND e.deleted_at IS NULL
GROUP BY ep.user_id;

-- name: ListPairwiseMovementsPersonal :many
-- GetPairwiseParticipantsPersonal in the order the expenses were added,
-- for how long a debt has been open (ADR-023). Added, not dated: an
-- expense back-dated today is new debt today.
SELECT ep.user_id, ep.amount, e.created_at FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
WHERE e.deleted_at IS NULL AND e.group_id IS NULL AND (
    (ep.user_id = sqlc.arg('user_b') AND e.paid_by_id = sqlc.arg('user_a'))
    OR (ep.user_id = sqlc.arg('user_a') AND e.paid_by_id = sqlc.arg('user_b'))
)
ORDER BY e.created_at, e.id;

-- name: ListGroupShareRows :many
-- Every share of every live expense in a group, in the order the
-- expenses were added -- each member's movements in the group (ADR-023).
SELECT e.id AS expense_id, e.paid_by_id, e.amount AS expense_amount, e.created_at,
       e.split_type, ep.user_id, ep.amount AS share
FROM expenses e
JOIN expense_participants ep ON ep.expense_id = e.id
WHERE e.group_id = $1 AND e.deleted_at IS NULL
ORDER BY e.created_at, e.id;
