-- Trial feedback 2026-10-07: notifications written before the money
-- formatting fix show raw minor units ("Carol recorded a settlement of
-- 36000000 ETB." for 360,000.00 ETB). Rewrite those old bodies into the
-- current wording and format (money.Format: two decimals, thousands
-- commas). Text only: no amount or balance is stored here. Bodies
-- written since the fix contain a "." in the amount, so they never
-- match these patterns, and running this twice changes nothing.

CREATE FUNCTION pg_temp.abro_money(minor text, code text) RETURNS text AS $$
    SELECT to_char(minor::numeric / 100, 'FM999,999,999,999,990.00') || ' ' || code
$$ LANGUAGE sql IMMUTABLE;

-- Settlements: "X recorded a settlement of 5000 ETB."
UPDATE notifications n
SET body = m[1] || ' recorded a payment of ' || pg_temp.abro_money(m[2], m[3]) || ' to you.'
FROM (
    SELECT id, regexp_match(body, '^(.*) recorded a settlement of (\d+) ([A-Z]{3})\.$') AS m
    FROM notifications WHERE type = 'SETTLEMENT'
) x
WHERE n.id = x.id AND x.m IS NOT NULL;

-- Expenses: 'X added an expense: "Dinner" (300 ETB).' (also edited/deleted)
UPDATE notifications n
SET body = m[1] || ' an expense: ' || m[2] || ' (' || pg_temp.abro_money(m[3], m[4]) || ').'
FROM (
    SELECT id, regexp_match(body, '^(.* (?:added|edited|deleted)) an expense: (".*") \((\d+) ([A-Z]{3})\)\.$') AS m
    FROM notifications WHERE type IN ('EXPENSE_ADDED', 'EXPENSE_EDITED', 'EXPENSE_DELETED')
) x
WHERE n.id = x.id AND x.m IS NOT NULL;

-- Recurring: 'A recurring expense was generated: "Rent" (500000 ETB).'
UPDATE notifications n
SET body = 'A recurring expense was generated: ' || m[1] || ' (' || pg_temp.abro_money(m[2], m[3]) || ').'
FROM (
    SELECT id, regexp_match(body, '^A recurring expense was generated: (".*") \((\d+) ([A-Z]{3})\)\.$') AS m
    FROM notifications WHERE type = 'RECURRING_EXPENSE'
) x
WHERE n.id = x.id AND x.m IS NOT NULL;
