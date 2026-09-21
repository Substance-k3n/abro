-- Ported from apps/api/prisma/schema/currency.prisma. Point-in-time rate
-- snapshot -- each refresh INSERTS a new row, existing rows are never
-- updated in place, so an expense's conversion_id keeps pointing at the
-- exact rate it used forever (ABRO_PRD.md §27).
CREATE TABLE currency_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_from TEXT NOT NULL,
    currency_to   TEXT NOT NULL,
    rate          NUMERIC(20, 10) NOT NULL,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX currency_rates_from_to_idx ON currency_rates (currency_from, currency_to);
